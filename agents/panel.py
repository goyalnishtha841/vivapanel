"""The viva panel: moderator + three examiners sharing one transcript.

This is the interface the backend uses (see docs/agents-interface.md):

    panel = Panel(summary)
    for event in panel.start():           # plan + first question
        send(event)
    for event in panel.answer(text):      # after each student reply
        send(event)
    panel.done, panel.state.assessments   # for the report
    panel.to_json() / Panel.from_json()   # persist between requests (SQLite)

`start()` and `answer()` are generators: each Event is yielded as soon as it's ready, so the
SSE stream can show "Engineer is thinking…" between LLM calls instead of waiting for all of them.
"""
from __future__ import annotations

from collections.abc import Iterator

from pydantic import BaseModel

from .examiner import DISPLAY, Examiner
from .guardrails import ANSWER_NOTES, clip_answer, classify_answer
from .llm import LLMError
from .moderator import ORDER, Moderator
from .schemas import (
    Assessment, Event, Examiner as Role, PanelPlan, PlannedTopic, PreviousAttempt, ProjectSummary, Report, RoleBrief,
    RunTestsResult, ToolRecord, Turn, Verification,
)
from . import llm
from .tools import TestRunner

MAX_QUESTIONS = 12      # ~5 minute session
MAX_CHALLENGES = 2      # cross-examiner interjections per session
MAX_TEST_RUNS = 1       # sandbox verifications per session (each can take up to a minute)
RETAKE_QUESTIONS_PER_TOPIC = 3  # an opener and up to two follow-ups


class PanelState(BaseModel):
    examiners: list[Role]
    plan: PanelPlan | None = None
    queues: dict[str, list[PlannedTopic]] = {}
    transcript: list[Turn] = []
    assessments: list[Assessment] = []
    follow_ups_on_topic: int = 0
    challenges_used: int = 0
    verifications: list[Verification] = []
    tool_calls: list[ToolRecord] = []
    done: bool = False
    max_questions: int = MAX_QUESTIONS
    # retake only: the attempt it builds on, and last time's questions per topic (not to be asked again)
    previous: PreviousAttempt | None = None
    avoid_questions: dict[str, list[str]] = {}
    role: RoleBrief | None = None  # hiring mode: the job this viva screens for


class Panel:
    def __init__(self, summary: ProjectSummary, examiners: tuple[Role, ...] = ORDER, state: PanelState | None = None,
                 run_tests: TestRunner | None = None, repo_tools=None):
        """repo_tools: an object with read_file(path, start_line=1) and search_code(query) — e.g. LocalRepoTools.
        When given, the Engineer becomes a tool-using agent (reads/searches the code, picks which tests to run)."""
        self.summary = summary
        self.run_tests = run_tests
        self.repo_tools = repo_tools
        self.state = state or PanelState(examiners=list(examiners))
        roles = tuple(self.state.examiners)
        self.moderator = Moderator(summary, roles)
        self.examiners = {r: Examiner(r, summary) for r in roles}

    # ---------- persistence ----------

    def to_json(self) -> str:
        return self.state.model_dump_json()

    @classmethod
    def from_json(cls, summary: ProjectSummary, data: str, run_tests: TestRunner | None = None,
                  repo_tools=None) -> "Panel":
        return cls(summary, state=PanelState.model_validate_json(data), run_tests=run_tests, repo_tools=repo_tools)

    @classmethod
    def retake(cls, summary: ProjectSummary, previous_session: str, report: Report, previous: PanelState,
               run_tests: TestRunner | None = None, repo_tools=None) -> "Panel":
        """A shorter viva on the topics the student found hardest last time. The plan comes from code, not the model:
        it is built from the previous report's scores, so it can't drift to topics the student already handled."""
        moderator = Moderator(summary, tuple(previous.examiners))
        plan = moderator.retake_plan(report, previous.plan)
        state = PanelState(
            examiners=previous.examiners, plan=plan,
            queues={r: [t for t in plan.topics if t.examiner == r] for r in previous.examiners},
            max_questions=min(MAX_QUESTIONS, RETAKE_QUESTIONS_PER_TOPIC * len(plan.topics)),
            previous=PreviousAttempt(session_id=previous_session, overall_score=report.overall_score,
                                     topics={t.topic: t.confidence for t in report.topics}),
            avoid_questions={t.title: [p.question for p in previous.transcript if p.topic == t.title] for t in plan.topics},
        )
        return cls(summary, state=state, run_tests=run_tests, repo_tools=repo_tools)

    @property
    def done(self) -> bool:
        return self.state.done

    @property
    def awaiting_answer(self) -> bool:
        t = self.state.transcript
        return bool(t) and t[-1].answer is None and not self.state.done

    # ---------- session flow ----------

    def start(self) -> Iterator[Event]:
        if self.state.plan is None:
            yield Event(speaker="moderator", message="Reading your project and planning the panel…",
                        reasoning="Moderator is assigning topics so examiners don't overlap.")
            self.state.plan = self.moderator.plan(role=self.state.role)
            self.state.queues = {r: [t for t in self.state.plan.topics if t.examiner == r] for r in self.state.examiners}
        plan = self.state.plan
        message, reasoning = self.moderator.plan_announcement(plan, retake=self.state.previous)
        yield Event(speaker="moderator", message=message, reasoning=reasoning)

        first = self.moderator.next_speaker(None, self.state.queues)
        if first is None:
            yield from self._finish("No topics could be planned for this repository.")
            return
        yield from self._open(first)

    def answer(self, text: str, seconds: float | None = None, pasted: bool | None = None) -> Iterator[Event]:
        if not self.awaiting_answer:
            yield Event(speaker="system", message="No question is waiting for an answer.")
            return
        st = self.state
        turn = st.transcript[-1]
        turn.answer = text.strip()
        turn.seconds, turn.pasted = seconds, pasted
        yield Event(speaker="student", message=turn.answer)
        kind = classify_answer(turn.answer)
        asker = self.examiners[turn.examiner]

        # 0. "Can you repeat that?" — re-ask more simply, ungraded, once per question.
        if kind == "clarify" and turn.kind != "rephrase" and len(st.transcript) < st.max_questions:
            try:
                q = asker.rephrase(st.transcript)
            except LLMError:
                turn.answer = turn.seconds = turn.pasted = None
                raise
            turn.verdict, turn.judgement = "not_applicable", "Student asked for clarification."
            yield self._ask(turn.examiner, "rephrase", turn.topic, q.file_ref, q.question,
                            "Student asked for clarification — rephrasing, not graded.")
            return

        # 1. The examiner who asked judges the answer and decides: follow up or yield.
        try:
            if turn.examiner == "engineer" and self.repo_tools is not None and kind not in ("empty", "dont_know"):
                d = yield from self._stream_tools("engineer", asker.respond_agentic(
                    st.transcript, st.follow_ups_on_topic, self.repo_tools, note=ANSWER_NOTES.get(kind)))
            else:
                d = asker.respond(st.transcript, st.follow_ups_on_topic, note=ANSWER_NOTES.get(kind))
        except LLMError:
            turn.answer = turn.seconds = turn.pasted = None  # keep the question open so the student can resend
            raise
        d = _enforce(d, kind)
        if kind == "injection":
            yield Event(speaker="system", message="Guardrail: the answer contained instructions to the panel. "
                        "They were ignored and the answer was graded on its content only.",
                        reasoning=f"Matched an instruction-injection pattern; verdict capped at weak (now {d.verdict}).")
        turn.verdict, turn.judgement = d.verdict, d.judgement
        st.assessments.append(Assessment(
            examiner=turn.examiner, topic=turn.topic, file_ref=turn.file_ref, question=turn.question,
            answer=clip_answer(turn.answer), verdict=d.verdict, judgement=d.judgement,
        ))

        out_of_time = len(st.transcript) >= st.max_questions

        # 1b. A testable claim takes priority: the Engineer checks it in the sandbox.
        if d.testable_claim and not out_of_time and self._can_verify():
            yield from self._verify(len(st.transcript), d.testable_claim, d.test_path or None)
            return

        if d.action == "follow_up" and not out_of_time:
            st.follow_ups_on_topic += 1
            yield self._ask(turn.examiner, "follow_up", turn.topic, d.file_ref, d.question,
                            f"[{d.verdict}] {d.judgement} → {d.reasoning}")
            return

        # 2. Asker yields. A colleague may challenge that verdict before the floor moves on.
        topic_challenged = any(t.kind == "challenge" and t.topic == turn.topic for t in st.transcript)
        # Only strong/partial verdicts are worth a second opinion; a weak answer has already been caught.
        if not out_of_time and st.challenges_used < MAX_CHALLENGES and not topic_challenged \
                and d.verdict in ("strong", "partial"):
            challenger = self.moderator.challenger_for(turn, st.challenges_used)
            if challenger:
                try:
                    c = self.examiners[challenger].consider_challenge(st.transcript)
                except LLMError:
                    c = None  # a challenge is optional; carry on without it
                if c and c.interject:
                    st.challenges_used += 1
                    st.follow_ups_on_topic = 1  # challenger gets at most one more follow-up here
                    yield self._ask(
                        challenger, "challenge", turn.topic, c.file_ref, c.message,
                        f"{DISPLAY[turn.examiner]} rated this {d.verdict}. {DISPLAY[challenger]} "
                        f"[{c.stance}]: {c.reasoning}",
                    )
                    return

        # 3. Moderator hands the floor to the next examiner with topics left.
        if out_of_time:
            yield from self._finish(f"Question limit ({st.max_questions}) reached.")
            return
        nxt = self.moderator.next_speaker(turn.examiner, st.queues)
        if nxt is None:
            yield from self._finish("All planned topics covered.")
            return
        yield Event(
            speaker="moderator", message=f"{DISPLAY[nxt]}, over to you.",
            reasoning=f"{DISPLAY[turn.examiner]} judged the last answer {d.verdict}: {d.judgement} "
                      f"Topic closed; {DISPLAY[nxt]} has {len(st.queues[nxt])} topic(s) left.",
        )
        yield from self._open(nxt)

    # ---------- sandbox verification ----------

    def _can_verify(self) -> bool:
        return (self.run_tests is not None and "engineer" in self.examiners
                and len(self.state.verifications) < MAX_TEST_RUNS)

    def _safe_run_tests(self, test_path: str | None) -> RunTestsResult:
        try:
            return self.run_tests(test_path)
        except Exception as e:  # the sandbox must never take the viva down
            return RunTestsResult(status="error", command=f"run_tests({test_path!r})", output_tail=str(e)[-500:])

    def _verify(self, turn_no: int, claim: str, test_path: str | None) -> Iterator[Event]:
        st = self.state
        turn = st.transcript[turn_no - 1]
        engineer = self.examiners["engineer"]
        if self.repo_tools is not None:
            # Agentic: the Engineer chooses which tests to run and may read them before judging.
            v, result = yield from self._stream_tools("engineer", engineer.verify_agentic(
                st.transcript, claim, test_path, self.repo_tools, self._safe_run_tests))
            ran = next((r for r in reversed(st.tool_calls) if r.tool == "run_tests"), None)
            test_path = (ran.args.get("test_path") or None) if ran else test_path  # what the agent actually ran
        else:
            target = test_path or "the full test suite"
            yield Event(
                speaker="engineer", message=f"That's a testable claim. Let me run {target} in the sandbox.",
                reasoning=f"Student claimed: \"{claim}\". Checking it against the project's own tests.",
                file_ref=test_path, tool_used="run_tests",
            )
            result = self._safe_run_tests(test_path)
            yield self._tool_result_event("run_tests", {"test_path": test_path or ""}, result.model_dump())
            v = engineer.verify(st.transcript, claim, result)
        if v.outcome == "contradicted" and not (result.failed or result.errors) and "fail" not in claim.lower():
            # Guardrail: an all-green run can't disprove a claim that something works; at most it fails to prove it.
            v = v.model_copy(update={"outcome": "inconclusive"})
        st.verifications.append(Verification(
            turn=turn_no, claim=claim, test_path=test_path, result=result, outcome=v.outcome, explanation=v.explanation,
        ))
        st.follow_ups_on_topic = 1  # Engineer judges the next answer and may follow up once more
        yield self._ask("engineer", "verify", turn.topic, test_path or turn.file_ref or "", f"{v.explanation} {v.question}",
                        f"[test {v.outcome}] {claim}")

    # ---------- tool calls -> events ----------

    def _stream_tools(self, role: Role, gen):
        """Run an agentic examiner move: turn each llm.ToolCall into Events, record it, return the decision."""
        while True:
            try:
                call = next(gen)
            except StopIteration as stop:
                return stop.value
            if call.result is None:
                yield _tool_start_event(role, call)
            else:
                event = self._tool_result_event(call.name, call.args, call.result)
                self.state.tool_calls.append(ToolRecord(
                    turn=len(self.state.transcript), examiner=role, tool=call.name,
                    args={k: v for k, v in call.args.items() if k != "why"}, summary=event.message,
                ))
                yield event

    def _tool_result_event(self, name: str, args: dict, result: dict) -> Event:
        if "error" in result and name != "run_tests":
            msg, why = f"{name}: {result['error']}", ""
        elif name == "read_file":
            msg = f"Read {result['path']} ({result.get('total_lines', '?')} lines)"
            why = ""
        elif name == "search_code":
            m = result.get("matches", [])
            first = f" — first: {m[0]['path']}:{m[0]['line']}" if m else ""
            msg = f"Search “{result.get('query', '')}”: {len(m)}{'+' if result.get('truncated') else ''} match(es){first}"
            why = " · ".join(f"{x['path']}:{x['line']} {x['text'][:60]}" for x in m[:4])
        else:  # run_tests
            r = RunTestsResult.model_validate(result) if "status" in result else None
            if r is None:
                msg, why = f"run_tests: {result.get('error', 'no result')}", ""
            else:
                msg = (f"Sandbox: {r.status} — {r.passed} passed, {r.failed} failed"
                       + (f", {r.errors} errors" if r.errors else "") + f" ({r.duration_s:.1f}s)")
                why = r.command + (f" · failing: {', '.join(r.failing_tests)}" if r.failing_tests else "")
        first_match = (result.get("matches") or [{}])[0].get("path") if name == "search_code" else None
        ref = args.get("path") or args.get("test_path") or first_match or None  # the code viewer jumps here
        return Event(speaker="system", message=msg, reasoning=why, file_ref=ref, tool_used=name)

    # ---------- helpers ----------

    def _open(self, role: Role) -> Iterator[Event]:
        topic = self.state.queues[role][0]
        q = self.examiners[role].open_topic(topic, self.state.transcript,  # pop only after this succeeds
                                            avoid=self.state.avoid_questions.get(topic.title, []))
        self.state.queues[role].pop(0)
        self.state.follow_ups_on_topic = 0
        yield self._ask(role, "open", topic.title, q.file_ref, q.question, q.reasoning)

    def _ask(self, role: Role, kind: str, topic: str, file_ref: str, question: str, reasoning: str) -> Event:
        self.state.transcript.append(Turn(examiner=role, kind=kind, topic=topic, file_ref=file_ref, question=question))
        return Event(speaker=role, message=question, reasoning=reasoning, file_ref=file_ref)

    def _finish(self, reason: str) -> Iterator[Event]:
        self.state.done = True
        answered = [t for t in self.state.transcript if t.answer is not None]
        yield Event(
            speaker="moderator",
            message="That's the end of the viva. Thank you — your report is being prepared.",
            reasoning=f"{reason} {len(answered)} questions answered, {self.state.challenges_used} cross-challenge(s).",
        )


def _enforce(d, kind: str):
    """Code has the last word on edge cases, whatever the model said."""
    if kind in ("empty", "dont_know") and d.verdict != "no_answer":
        d = d.model_copy(update={"verdict": "no_answer"})
    if kind == "injection":
        update = {"testable_claim": "", "test_path": ""}
        if d.verdict in ("strong", "partial"):
            update |= {"verdict": "weak", "judgement": "[Instruction attempt ignored.] " + d.judgement}
        d = d.model_copy(update=update)
    if kind in ("empty", "dont_know", "one_word"):
        d = d.model_copy(update={"testable_claim": "", "test_path": ""})
    return d


def _tool_start_event(role: Role, call: "llm.ToolCall") -> Event:
    a = call.args
    if call.name == "read_file":
        msg, ref = f"Let me look at {a.get('path')}.", a.get("path")
    elif call.name == "search_code":
        msg, ref = f"Let me search the code for “{a.get('query')}”.", None
    else:
        target = a.get("test_path") or "the full test suite"
        msg, ref = f"That's testable. Let me run {target} in the sandbox.", a.get("test_path") or None
    return Event(speaker=role, message=msg, reasoning=str(a.get("why", "")), file_ref=ref, tool_used=call.name)
