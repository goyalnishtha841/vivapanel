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
    Assessment, Event, Examiner as Role, PanelPlan, PlannedTopic, ProjectSummary, RunTestsResult, Turn, Verification,
)
from .tools import TestRunner

MAX_QUESTIONS = 12      # ~5 minute session
MAX_CHALLENGES = 2      # cross-examiner interjections per session
MAX_TEST_RUNS = 1       # sandbox verifications per session (each can take up to a minute)


class PanelState(BaseModel):
    examiners: list[Role]
    plan: PanelPlan | None = None
    queues: dict[str, list[PlannedTopic]] = {}
    transcript: list[Turn] = []
    assessments: list[Assessment] = []
    follow_ups_on_topic: int = 0
    challenges_used: int = 0
    verifications: list[Verification] = []
    done: bool = False


class Panel:
    def __init__(self, summary: ProjectSummary, examiners: tuple[Role, ...] = ORDER, state: PanelState | None = None,
                 run_tests: TestRunner | None = None):
        self.summary = summary
        self.run_tests = run_tests
        self.state = state or PanelState(examiners=list(examiners))
        roles = tuple(self.state.examiners)
        self.moderator = Moderator(summary, roles)
        self.examiners = {r: Examiner(r, summary) for r in roles}

    # ---------- persistence ----------

    def to_json(self) -> str:
        return self.state.model_dump_json()

    @classmethod
    def from_json(cls, summary: ProjectSummary, data: str, run_tests: TestRunner | None = None) -> "Panel":
        return cls(summary, state=PanelState.model_validate_json(data), run_tests=run_tests)

    @property
    def done(self) -> bool:
        return self.state.done

    @property
    def awaiting_answer(self) -> bool:
        t = self.state.transcript
        return bool(t) and t[-1].answer is None and not self.state.done

    # ---------- session flow ----------

    def start(self) -> Iterator[Event]:
        yield Event(speaker="moderator", message="Reading your project and planning the panel…",
                    reasoning="Moderator is assigning topics so examiners don't overlap.")
        plan = self.moderator.plan()
        self.state.plan = plan
        self.state.queues = {r: [t for t in plan.topics if t.examiner == r] for r in self.state.examiners}
        message, reasoning = self.moderator.plan_announcement(plan)
        yield Event(speaker="moderator", message=message, reasoning=reasoning)

        first = self.moderator.next_speaker(None, self.state.queues)
        if first is None:
            yield from self._finish("No topics could be planned for this repository.")
            return
        yield from self._open(first)

    def answer(self, text: str) -> Iterator[Event]:
        if not self.awaiting_answer:
            yield Event(speaker="system", message="No question is waiting for an answer.")
            return
        st = self.state
        turn = st.transcript[-1]
        turn.answer = text.strip()
        yield Event(speaker="student", message=turn.answer)
        kind = classify_answer(turn.answer)
        asker = self.examiners[turn.examiner]

        # 0. "Can you repeat that?" — re-ask more simply, ungraded, once per question.
        if kind == "clarify" and turn.kind != "rephrase" and len(st.transcript) < MAX_QUESTIONS:
            try:
                q = asker.rephrase(st.transcript)
            except LLMError:
                turn.answer = None
                raise
            turn.verdict, turn.judgement = "not_applicable", "Student asked for clarification."
            yield self._ask(turn.examiner, "rephrase", turn.topic, q.file_ref, q.question,
                            "Student asked for clarification — rephrasing, not graded.")
            return

        # 1. The examiner who asked judges the answer and decides: follow up or yield.
        try:
            d = asker.respond(st.transcript, st.follow_ups_on_topic, note=ANSWER_NOTES.get(kind))
        except LLMError:
            turn.answer = None  # keep the question open so the student can resend the answer
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

        out_of_time = len(st.transcript) >= MAX_QUESTIONS

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
        if not out_of_time and st.challenges_used < MAX_CHALLENGES and not topic_challenged \
                and d.verdict != "no_answer":
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
            yield from self._finish(f"Question limit ({MAX_QUESTIONS}) reached.")
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

    def _verify(self, turn_no: int, claim: str, test_path: str | None) -> Iterator[Event]:
        st = self.state
        turn = st.transcript[turn_no - 1]
        target = test_path or "the full test suite"
        yield Event(
            speaker="engineer", message=f"That's a testable claim. Let me run {target} in the sandbox.",
            reasoning=f"Student claimed: \"{claim}\". Checking it against the project's own tests.",
            file_ref=test_path, tool_used="run_tests",
        )
        try:
            result = self.run_tests(test_path)
        except Exception as e:  # the sandbox must never take the viva down
            result = RunTestsResult(status="error", command=f"run_tests({test_path!r})", output_tail=str(e)[-500:])
        yield Event(
            speaker="system",
            message=f"Sandbox: {result.status} — {result.passed} passed, {result.failed} failed"
                    + (f", {result.errors} errors" if result.errors else "") + f" ({result.duration_s:.1f}s)",
            reasoning=f"{result.command}" + (f" · failing: {', '.join(result.failing_tests)}" if result.failing_tests else ""),
            file_ref=test_path, tool_used="run_tests",
        )
        engineer = self.examiners["engineer"]
        v = engineer.verify(st.transcript, claim, result)
        st.verifications.append(Verification(
            turn=turn_no, claim=claim, test_path=test_path, result=result, outcome=v.outcome, explanation=v.explanation,
        ))
        st.follow_ups_on_topic = 1  # Engineer judges the next answer and may follow up once more
        yield self._ask("engineer", "verify", turn.topic, test_path or turn.file_ref or "", f"{v.explanation} {v.question}",
                        f"[test {v.outcome}] {claim}")

    # ---------- helpers ----------

    def _open(self, role: Role) -> Iterator[Event]:
        topic = self.state.queues[role][0]
        q = self.examiners[role].open_topic(topic, self.state.transcript)  # pop only after this succeeds
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
