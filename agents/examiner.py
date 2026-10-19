"""Examiner agents (Professor, Engineer, Junior).

An examiner has no memory of its own: every call receives the panel's shared transcript, so all
three examiners remember everything the student has said to anyone. Three moves:

    open_topic(topic, transcript)        -> QuestionDecision   start a topic the moderator assigned
    respond(transcript, follow_ups_used) -> RespondDecision    judge the answer to MY question, follow up or yield
    consider_challenge(transcript)       -> ChallengeDecision  react to a colleague's judgement
"""
from __future__ import annotations

from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

from . import llm
from .guardrails import ensure_question_cites, fallback_ref, file_ref_exists, is_non_answer, split_ref
from .schemas import (
    ChallengeDecision,
    Examiner as Role,
    KeyFile,
    PlannedTopic,
    ProjectSummary,
    QuestionDecision,
    RespondDecision,
    Turn,
)

PROMPTS = Path(__file__).parent / "prompts"
MAX_FOLLOW_UPS = 2
TRANSCRIPT_WINDOW = 20
DISPLAY = {"professor": "Professor", "engineer": "Engineer", "junior": "Junior"}

T = TypeVar("T", bound=BaseModel)


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


def render_transcript(transcript: list[Turn]) -> str:
    if not transcript:
        return "(nothing yet)"
    shown = transcript[-TRANSCRIPT_WINDOW:]
    lines = [f"(earlier {len(transcript) - len(shown)} turns omitted)"] if len(transcript) > len(shown) else []
    for i, t in enumerate(shown, len(transcript) - len(shown) + 1):
        lines.append(f"Q{i} {DISPLAY[t.examiner]} [{t.kind}, topic: {t.topic}] ({t.file_ref}): {t.question}")
        lines.append(f"A{i} Student: {t.answer if t.answer is not None else '(awaiting)'}")
        if t.verdict:
            lines.append(f"   ↳ {DISPLAY[t.examiner]} judged: {t.verdict} — {t.judgement}")
    return "\n".join(lines)


class Examiner:
    def __init__(self, role: Role, summary: ProjectSummary):
        self.role = role
        self.summary = summary
        self.system = "\n\n".join(
            [
                (PROMPTS / f"{role}.md").read_text(),
                (PROMPTS / "common.md").read_text(),
                "## Project under examination\n" + render_summary(summary),
            ]
        )

    @property
    def name(self) -> str:
        return DISPLAY[self.role]

    # ---------- moves ----------

    def open_topic(self, topic: PlannedTopic, transcript: list[Turn]) -> QuestionDecision:
        if llm.is_offline():
            d = self._offline_open(topic)
        else:
            user = (
                f"## Panel transcript\n{render_transcript(transcript)}\n\n"
                f"## Your turn\nThe moderator gave you the floor to open this topic:\n"
                f"- Topic: {topic.title}\n- Anchor: {topic.file_ref}\n- Why it matters: {topic.why}\n\n"
                "Ask your opening question on it. If the student already said something relevant earlier, build on it."
            )
            d = self._grounded(user, QuestionDecision, lambda d: d.file_ref, default_ref=topic.file_ref)
        return d.model_copy(update={"question": ensure_question_cites(d.question, d.file_ref)})

    def respond(self, transcript: list[Turn], follow_ups_used: int) -> RespondDecision:
        last = transcript[-1]
        if llm.is_offline():
            d = self._offline_respond(last, follow_ups_used)
        else:
            limit = (
                "You have used the follow-up limit on this topic — you MUST yield."
                if follow_ups_used >= MAX_FOLLOW_UPS
                else f"Follow-ups used on this topic: {follow_ups_used} of {MAX_FOLLOW_UPS}."
            )
            user = (
                f"## Panel transcript\n{render_transcript(transcript)}\n\n"
                f"## Your turn\nThe student just answered YOUR question Q{len(transcript)}. "
                "Judge that answer against the code. Then either follow up with a narrower, deeper question on the "
                "same topic (when the answer was partial, weak or no_answer and digging further is worthwhile), or "
                f"yield the floor (when the answer was strong or the topic is exhausted). {limit}"
            )
            d = self._grounded(
                user, RespondDecision, lambda d: d.file_ref if d.action == "follow_up" else None,
                default_ref=last.file_ref or fallback_ref(self.summary),
            )
        if follow_ups_used >= MAX_FOLLOW_UPS and d.action == "follow_up":
            d = d.model_copy(update={"action": "yield", "question": "", "file_ref": ""})
        if d.action == "follow_up":
            d = d.model_copy(update={"question": ensure_question_cites(d.question, d.file_ref)})
        return d

    def consider_challenge(self, transcript: list[Turn]) -> ChallengeDecision:
        last = transcript[-1]
        if llm.is_offline():
            return self._offline_challenge(last)
        user = (
            f"## Panel transcript\n{render_transcript(transcript)}\n\n"
            f"## Your turn\nYour colleague the {DISPLAY[last.examiner]} just judged the student's last answer as "
            f"`{last.verdict}` and is moving on. Interject only if, from your own lane, either (a) you think that "
            "verdict was wrong given the code (stance `disagree`), or (b) the verdict stands but the answer misses "
            "something important that you can probe in one question (stance `extend`). Otherwise set interject to "
            "false. Interjections should be rare and sharp — a real panel member doesn't speak just to speak."
        )
        d = self._grounded(
            user, ChallengeDecision, lambda d: d.file_ref if d.interject else None,
            default_ref=last.file_ref or fallback_ref(self.summary),
        )
        if d.interject:
            d = d.model_copy(update={"message": ensure_question_cites(d.message, d.file_ref)})
        return d

    # ---------- LLM call with file_ref guardrail ----------

    def _grounded(self, user: str, schema: type[T], ref_of, default_ref: str) -> T:
        """Call the model; if it cites a file that isn't in the repo, retry once, then fall back to a real file."""
        d = llm.structured_call(self.system, user, schema)
        ref = ref_of(d)
        if ref is None or file_ref_exists(ref, self.summary):
            return d
        retry = (
            user + f"\n\nYour previous draft cited `{ref}`, which is NOT in the file list. "
            "Rewrite your answer citing a path that is in the file list."
        )
        d = llm.structured_call(self.system, retry, schema)
        ref = ref_of(d)
        if ref is None or file_ref_exists(ref, self.summary):
            return d
        return d.model_copy(update={"file_ref": default_ref})

    # ---------- offline (scripted) behaviour: no API key needed ----------

    def _key_file(self, file_ref: str | None) -> KeyFile | None:
        path = split_ref(file_ref or "")[0]
        return next((kf for kf in self.summary.key_files if kf.path == path), None)

    def _offline_open(self, topic: PlannedTopic) -> QuestionDecision:
        path, func = split_ref(topic.file_ref)
        target = f"`{func}` in `{path}`" if func else f"`{path}`"
        q = {
            "professor": f"Why did you design {target} this way, and what alternative did you reject?",
            "engineer": f"What happens in {target} when two users hit it at the same moment, or send malicious input?",
            "junior": f"Can you explain what {target} does, step by step, like I'm a first-year?",
        }[self.role]
        return QuestionDecision(file_ref=topic.file_ref, question=q, reasoning=f"Opening '{topic.title}': {topic.why}")

    def _offline_respond(self, last: Turn, follow_ups_used: int) -> RespondDecision:
        verdict, judgement = heuristic_judge(last, self._key_file(last.file_ref))
        if verdict in ("weak", "partial", "no_answer") and follow_ups_used < MAX_FOLLOW_UPS:
            kf = self._key_file(last.file_ref)
            func = kf.functions[(follow_ups_used + 1) % len(kf.functions)] if kf and kf.functions else None
            ref = f"{kf.path}:{func}" if kf and func else (last.file_ref or fallback_ref(self.summary))
            return RespondDecision(
                verdict=verdict, judgement=judgement, action="follow_up", file_ref=ref,
                question=f"Let's be concrete: walk me through exactly what `{func or ref}` does and why you wrote it that way.",
                reasoning="Answer wasn't grounded in the code, so narrowing to a single function.",
            )
        return RespondDecision(
            verdict=verdict, judgement=judgement, action="yield", file_ref="", question="",
            reasoning="Topic covered well enough." if verdict == "strong" else "Follow-up limit reached.",
        )

    def _offline_challenge(self, last: Turn) -> ChallengeDecision:
        # Scripted rule: the Engineer pushes back on lenient 'strong' verdicts from the others.
        if self.role == "engineer" and last.examiner != "engineer" and last.verdict == "strong":
            ref = last.file_ref or fallback_ref(self.summary)
            return ChallengeDecision(
                interject=True, stance="extend",
                message=f"I'd push the {DISPLAY[last.examiner]}'s point further. With a thousand students at once, "
                f"what breaks first in `{split_ref(ref)[0]}`?",
                file_ref=ref, reasoning="Answer was right on design but ignored behaviour under load.",
            )
        return ChallengeDecision(interject=False, stance="none", message="", file_ref="", reasoning="Nothing to add.")


def heuristic_judge(turn: Turn, kf: KeyFile | None) -> tuple[str, str]:
    answer = turn.answer or ""
    if is_non_answer(answer):
        return "no_answer", "Student did not attempt an answer."
    words = answer.split()
    vocab: set[str] = set()
    if kf:
        vocab = {f.lower() for f in kf.functions} | {w.lower().strip("(),:'\"") for w in kf.snippet.split() if len(w) > 4}
    hits = [w for w in words if w.lower().strip(".,()`'\"") in vocab]
    if len(words) < 8:
        return "weak", "Answer is too short to show understanding."
    if len(hits) >= 2:
        return "strong", f"Answer references the actual code ({', '.join(sorted(set(hits))[:3])})."
    return "partial", "Answer is generic and does not refer to anything specific in the code."
