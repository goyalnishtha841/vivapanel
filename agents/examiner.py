"""A single examiner agent: asks one question per turn, judges the answer against the code,
then chooses a follow-up or a new topic.

Usage:
    ex = Examiner("professor", summary)
    event = ex.ask()               # first question
    event = ex.ask("student reply")  # judges the reply, returns next question (or an end event)
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from . import llm
from .guardrails import ensure_question_cites, file_ref_exists, is_non_answer
from .schemas import Assessment, Event, ExaminerDecision, ProjectSummary, Speaker

PROMPTS = Path(__file__).parent / "prompts"
MAX_FOLLOW_UPS = 2


def render_summary(s: ProjectSummary) -> str:
    parts = [
        f"**{s.name}** — {s.one_liner}",
        f"Tech stack: {', '.join(s.tech_stack)}",
        "README claims:\n" + "\n".join(f"- {c}" for c in s.readme_claims),
        "File list (the ONLY valid paths for file_ref):\n" + "\n".join(f"- {f}" for f in s.files),
        f"Tests: {'yes, run with `' + (s.test_command or '?') + '`' if s.has_tests else 'none'}",
        "Key files:",
    ]
    for kf in s.key_files:
        parts.append(
            f"### {kf.path}\nPurpose: {kf.purpose}\nFunctions: {', '.join(kf.functions)}\n```\n{kf.snippet}\n```"
        )
    return "\n\n".join(parts)


def default_topics(s: ProjectSummary) -> list[str]:
    """Until the moderator exists (Day 2), each key file is one topic."""
    return [f"{kf.path}: {kf.purpose}" for kf in s.key_files]


@dataclass
class Turn:
    topic: str
    file_ref: str
    question: str
    answer: str | None = None


@dataclass
class Examiner:
    role: Speaker
    summary: ProjectSummary
    topics: list[str] = field(default_factory=list)
    turns: list[Turn] = field(default_factory=list)
    assessments: list[Assessment] = field(default_factory=list)
    follow_ups_on_topic: int = 0
    done: bool = False

    def __post_init__(self) -> None:
        if not self.topics:
            self.topics = default_topics(self.summary)
        template = (PROMPTS / f"{self.role}.md").read_text()
        self.system = template.replace("{{SUMMARY}}", render_summary(self.summary))

    # ---------- public ----------

    def ask(self, last_answer: str | None = None) -> Event:
        if self.done:
            return self._end_event("Session already finished.")
        if last_answer is not None and self.turns:
            self.turns[-1].answer = last_answer

        decision = self._decide()
        self._record_assessment(decision)

        if decision.action == "end":
            self.done = True
            return self._end_event(decision.judgement or "All assigned topics covered.")

        self.follow_ups_on_topic = self.follow_ups_on_topic + 1 if decision.action == "follow_up" else 0
        self.turns.append(Turn(decision.topic, decision.file_ref, decision.question))

        reasoning = decision.reasoning
        if decision.judgement:
            reasoning = f"[{decision.verdict}] {decision.judgement} → {decision.reasoning}"
        return Event(speaker=self.role, message=decision.question, reasoning=reasoning, file_ref=decision.file_ref)

    # ---------- decision making ----------

    def _decide(self) -> ExaminerDecision:
        if llm.is_offline():
            decision = self._offline_decide()
        else:
            decision = self._llm_decide()
        return ensure_question_cites(decision)

    def _session_state(self) -> str:
        covered = sorted({t.topic for t in self.turns})
        remaining = [t for t in self.topics if t not in covered]
        lines = [
            "## Session state",
            f"Assigned topics: {json.dumps(self.topics)}",
            f"Topics already asked about: {json.dumps(covered)}",
            f"Topics not yet touched: {json.dumps(remaining)}",
            f"Follow-ups used on the current topic: {self.follow_ups_on_topic} of {MAX_FOLLOW_UPS}"
            + (" — limit reached, you MUST choose new_topic or end." if self.follow_ups_on_topic >= MAX_FOLLOW_UPS else ""),
            "",
            "## Transcript so far",
        ]
        if not self.turns:
            lines.append("(none — this is your opening question; verdict must be not_applicable)")
        for i, t in enumerate(self.turns, 1):
            lines.append(f"Q{i} [{t.topic}] ({t.file_ref}): {t.question}")
            lines.append(f"A{i}: {t.answer if t.answer is not None else '(awaiting)'}")
        if self.turns:
            lines.append("\nJudge the LAST answer against the code, then ask your next question.")
        return "\n".join(lines)

    def _llm_decide(self) -> ExaminerDecision:
        user = self._session_state()
        decision = llm.structured_call(self.system, user, ExaminerDecision)
        if not file_ref_exists(decision.file_ref, self.summary):
            retry = (
                user
                + f"\n\nYour previous draft cited `{decision.file_ref}`, which is NOT in the file list. "
                "Rewrite the decision citing a path that is in the file list."
            )
            decision = llm.structured_call(self.system, retry, ExaminerDecision)
        if not file_ref_exists(decision.file_ref, self.summary):
            fallback = self.summary.key_files[0].path if self.summary.key_files else self.summary.files[0]
            decision = decision.model_copy(update={"file_ref": fallback})
        if self.follow_ups_on_topic >= MAX_FOLLOW_UPS and decision.action == "follow_up":
            decision = decision.model_copy(update={"action": "new_topic"})
        return decision

    def _offline_decide(self) -> ExaminerDecision:
        """Scripted examiner for running without an API key (dev, CI, demos without network)."""
        verdict, judgement = "not_applicable", ""
        last = self.turns[-1] if self.turns else None
        if last is not None:
            verdict, judgement = _heuristic_judge(last, self.summary)

        covered = {t.topic for t in self.turns}
        remaining = [t for t in self.topics if t not in covered]
        weak = verdict in ("weak", "partial", "no_answer")

        if last is not None and weak and self.follow_ups_on_topic < MAX_FOLLOW_UPS:
            kf = _key_file_for(last.file_ref, self.summary)
            func = kf.functions[(self.follow_ups_on_topic + 1) % len(kf.functions)] if kf and kf.functions else None
            ref = f"{kf.path}:{func}" if kf and func else last.file_ref
            return ExaminerDecision(
                verdict=verdict, judgement=judgement, action="follow_up", topic=last.topic, file_ref=ref,
                question=f"Let's be concrete. Walk me through exactly what `{func or ref}` does, line by line, and why you wrote it that way.",
                reasoning="Answer was not grounded in the code, so narrowing to a single function.",
            )
        if not remaining:
            return ExaminerDecision(
                verdict=verdict, judgement=judgement, action="end", topic=last.topic if last else "",
                file_ref=last.file_ref if last else self.summary.files[0], question="", reasoning="All topics covered.",
            )
        topic = remaining[0]
        kf = self.summary.key_files[self.topics.index(topic) % len(self.summary.key_files)]
        func = kf.functions[0] if kf.functions else None
        return ExaminerDecision(
            verdict=verdict, judgement=judgement, action="new_topic", topic=topic,
            file_ref=f"{kf.path}:{func}" if func else kf.path,
            question=f"In `{kf.path}`, why did you design `{func}` this way, and what alternative did you reject?",
            reasoning=f"Opening the topic '{topic}' with a design-justification question.",
        )

    # ---------- bookkeeping ----------

    def _record_assessment(self, decision: ExaminerDecision) -> None:
        if not self.turns or self.turns[-1].answer is None:
            return
        t = self.turns[-1]
        self.assessments.append(
            Assessment(
                examiner=self.role, topic=t.topic, file_ref=t.file_ref, question=t.question,
                answer=t.answer, verdict=decision.verdict, judgement=decision.judgement,
            )
        )

    def _end_event(self, reason: str) -> Event:
        return Event(speaker=self.role, message="That's all from me. Thank you.", reasoning=reason)


def _key_file_for(file_ref: str, s: ProjectSummary):
    path = file_ref.split(":")[0]
    return next((kf for kf in s.key_files if kf.path == path), None)


def _heuristic_judge(turn: Turn, s: ProjectSummary) -> tuple[str, str]:
    answer = turn.answer or ""
    if is_non_answer(answer):
        return "no_answer", "Student did not attempt an answer."
    words = answer.split()
    kf = _key_file_for(turn.file_ref, s)
    vocab = set()
    if kf:
        vocab = {f.lower() for f in kf.functions} | {w.lower().strip("(),:'\"") for w in kf.snippet.split() if len(w) > 4}
    hits = [w for w in words if w.lower().strip(".,()`'\"") in vocab]
    if len(words) < 8:
        return "weak", "Answer is too short to show understanding."
    if len(hits) >= 2:
        return "strong", f"Answer references the actual code ({', '.join(sorted(set(hits))[:3])})."
    return "partial", "Answer is generic and does not refer to anything specific in the code."
