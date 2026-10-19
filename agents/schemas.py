"""Shared data shapes for Viva Panel. Mirrors docs/api-contract.md.

Backend (B) and agents (A) both import from here so the contract has one definition.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field

Speaker = Literal["professor", "engineer", "junior", "moderator", "system", "student"]
ToolName = Literal["fetch_repo_tree", "read_file", "search_code", "run_tests"]


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Event(BaseModel):
    """One agent turn, streamed to the frontend over SSE."""

    speaker: Speaker
    message: str
    reasoning: str = ""
    file_ref: Optional[str] = None
    tool_used: Optional[ToolName] = None
    timestamp: str = Field(default_factory=now_iso)


class KeyFile(BaseModel):
    path: str
    purpose: str
    functions: list[str] = []
    snippet: str = ""


class ProjectSummary(BaseModel):
    repo_url: str
    name: str
    one_liner: str
    tech_stack: list[str] = []
    readme_claims: list[str] = []
    files: list[str] = []
    key_files: list[KeyFile] = []
    has_tests: bool = False
    test_command: Optional[str] = None


class RunTestsResult(BaseModel):
    status: Literal["passed", "failed", "error", "timeout"]
    command: str
    passed: int = 0
    failed: int = 0
    errors: int = 0
    skipped: int = 0
    duration_s: float = 0.0
    failing_tests: list[str] = []
    output_tail: str = ""


# ---- Internal to the agents (not sent to the frontend as-is) ----

Examiner = Literal["professor", "engineer", "junior"]
Verdict = Literal["strong", "partial", "weak", "no_answer", "not_applicable"]


class PlannedTopic(BaseModel):
    examiner: Examiner
    title: str = Field(description="Short label, e.g. 'Password hashing choice'.")
    file_ref: str = Field(description="Exact repo path from the file list, optionally ':function'.")
    why: str = Field(description="One sentence: why this is worth probing.")


class PanelPlan(BaseModel):
    """Moderator output: who probes what."""

    topics: list[PlannedTopic]


class QuestionDecision(BaseModel):
    """An examiner opening a new topic."""

    file_ref: str = Field(description="Exact repo path from the file list, optionally ':function'.")
    question: str = Field(description="The single question to ask now. Max 2 sentences, max 35 words.")
    reasoning: str = Field(description="Why this question, in one sentence, for the reasoning sidebar.")


class RespondDecision(BaseModel):
    """An examiner judging the answer to its own question, then following up or yielding the floor."""

    verdict: Verdict = Field(description="How well the student's LAST answer matched the actual code.")
    judgement: str = Field(description="One or two sentences comparing the answer with the code.")
    action: Literal["follow_up", "yield"] = Field(
        description="follow_up = one deeper question on the same topic; yield = done with this topic."
    )
    file_ref: str = Field(description="For follow_up: exact repo path from the file list. Empty when yielding.")
    question: str = Field(description="For follow_up: the single question, max 2 sentences, max 35 words. Empty when yielding.")
    reasoning: str = Field(description="Why follow up or yield, in one sentence.")
    testable_claim: str = Field(
        description="If the student's LAST answer claims something the project's own tests could confirm or refute "
        "(e.g. 'my tests cover double-borrowing', 'expired tokens are rejected', 'all tests pass'), restate that "
        "claim in one sentence. Empty string if there is no such claim."
    )
    test_path: str = Field(
        description="If testable_claim is set: the test file from the file list most likely to check it. "
        "Empty string to run the whole suite."
    )


class VerifyDecision(BaseModel):
    """The Engineer reading a sandbox test result against the student's claim."""

    outcome: Literal["supported", "contradicted", "inconclusive"] = Field(
        description="supported = the result backs the claim; contradicted = the result disproves it; "
        "inconclusive = the tests ran but don't actually exercise the claim, or the run errored/timed out."
    )
    explanation: str = Field(
        description="One sentence, max 30 words, citing the result (counts, failing test names) and what it means for the claim."
    )
    question: str = Field(description="One question to the student about this result. One sentence, max 25 words.")


class ChallengeDecision(BaseModel):
    """A different examiner reacting to a colleague's judgement of the last answer."""

    interject: bool = Field(description="True only if you have a substantive disagreement or a sharper angle.")
    stance: Literal["disagree", "extend", "none"] = Field(
        description="disagree = you think the colleague's verdict was wrong; extend = their verdict stands but "
        "the answer misses something in your lane; none = not interjecting."
    )
    message: str = Field(
        description="If interjecting: ONLY your one question to the STUDENT on the same topic, max 30 words. Do not "
        "address your colleague — the panel adds that. Empty otherwise."
    )
    file_ref: str = Field(description="If interjecting: exact repo path from the file list. Empty otherwise.")
    reasoning: str = Field(description="One sentence for the reasoning sidebar.")


class Turn(BaseModel):
    """One question and its answer, in the panel's shared memory."""

    examiner: Examiner
    kind: Literal["open", "follow_up", "challenge", "verify", "rephrase"]
    topic: str
    file_ref: Optional[str]
    question: str
    answer: Optional[str] = None
    verdict: Optional[Verdict] = None
    judgement: str = ""


class Assessment(BaseModel):
    """Per-answer record kept for the scoring agent (Day 3)."""

    examiner: Examiner
    topic: str
    file_ref: Optional[str]
    question: str
    answer: str
    verdict: Verdict
    judgement: str
    timestamp: str = Field(default_factory=now_iso)


class Verification(BaseModel):
    """A student claim checked by running the project's tests in the sandbox."""

    turn: int = Field(description="1-based index of the transcript turn whose answer made the claim.")
    claim: str
    test_path: Optional[str]
    result: RunTestsResult
    outcome: Literal["supported", "contradicted", "inconclusive"]
    explanation: str


# ---- Report (GET /report/{id}) ----

class Quote(BaseModel):
    turn: int
    speaker: str
    text: str


class TopicScore(BaseModel):
    topic: str
    examiner: Examiner
    file_ref: Optional[str]
    confidence: Optional[int] = Field(description="0–100 from the verdicts on this topic; None if never reached.")
    verdicts: list[Verdict]
    note: str = ""
    evidence: list[Quote] = []


class WeakSpot(BaseModel):
    title: str
    file_ref: Optional[str]
    why: str
    evidence: list[Quote] = []


class UnansweredQuestion(BaseModel):
    turn: int
    examiner: Examiner
    question: str
    file_ref: Optional[str]
    answer: str


class StudyStep(BaseModel):
    title: str
    action: str
    file_ref: Optional[str]
    minutes: int


class Report(BaseModel):
    repo_url: str
    project: str
    overall_score: int = Field(description="0–100, average of topic confidences.")
    readiness: Literal["ready", "almost_ready", "needs_work", "not_ready"]
    headline: str
    topics: list[TopicScore]
    weak_spots: list[WeakSpot]
    unanswered: list[UnansweredQuestion]
    test_evidence: list[Verification]
    study_plan: list[StudyStep]
    recruiter_summary: str
    questions_asked: int
    generated_at: str = Field(default_factory=now_iso)


class _NarrativeWeakSpot(BaseModel):
    title: str = Field(description="2–6 words.")
    file_ref: str = Field(description="Exact repo path from the file list.")
    why: str = Field(description="One or two sentences: what the student got wrong or couldn't explain, versus the code.")
    turns: list[int] = Field(description="Transcript turn numbers (Q numbers) that show this weakness.")


class _NarrativeTopicNote(BaseModel):
    topic: str = Field(description="Exactly one of the topic names given.")
    note: str = Field(description="One sentence on how the student did on this topic.")


class _NarrativeStudyStep(BaseModel):
    title: str = Field(description="2–6 words.")
    action: str = Field(description="One concrete thing to do, tied to this repo (e.g. rewrite X, read about Y then explain Z).")
    file_ref: str = Field(description="Exact repo path from the file list, or empty string.")
    minutes: int = Field(description="Realistic time in minutes, 10–120.")


class ReportNarrative(BaseModel):
    """What the scoring LLM writes. Numbers and quotes are filled in by code, not the model."""

    headline: str = Field(description="One sentence verdict on the student's understanding of their own project.")
    topic_notes: list[_NarrativeTopicNote]
    weak_spots: list[_NarrativeWeakSpot] = Field(description="2–5 most important weaknesses, worst first.")
    study_plan: list[_NarrativeStudyStep] = Field(description="3–6 steps, most important first.")
    recruiter_summary: str = Field(
        description="3–4 sentences for a recruiter: what the student demonstrably understands and doesn't, citing "
        "evidence (topics, test results). Neutral, factual, no hype."
    )
