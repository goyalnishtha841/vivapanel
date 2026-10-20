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
    title: str = Field(description="2–5 words, sentence case.")
    file_ref: str = Field(description="Listed path, optionally :function.")
    why: str = Field(description="One sentence.")


class PanelPlan(BaseModel):
    """Moderator: who probes what."""

    topics: list[PlannedTopic]


class QuestionDecision(BaseModel):
    """Open a topic."""

    file_ref: str = Field(description="Listed path, optionally :function.")
    question: str = Field(description="One question, ≤ 35 words.")
    reasoning: str = Field(description="Why, one sentence.")


class RespondDecision(BaseModel):
    """Judge the answer to your question, then follow up or yield."""

    verdict: Verdict
    judgement: str = Field(description="1–2 sentences: the answer vs the code.")
    action: Literal["follow_up", "yield"]
    file_ref: str = Field(description="follow_up only: listed path; else empty.")
    question: str = Field(description="follow_up only: one question, ≤ 35 words; else empty.")
    reasoning: str = Field(description="Why, one sentence.")
    testable_claim: str = Field(description="A claim in the answer the project's tests could check, restated; else empty.")
    test_path: str = Field(description="Test file most likely to check it; empty = whole suite.")


class VerifyDecision(BaseModel):
    """Read a sandbox test result against the student's claim."""

    outcome: Literal["supported", "contradicted", "inconclusive"] = Field(
        description="inconclusive = tests don't exercise the claim, or the run failed."
    )
    explanation: str = Field(description="One sentence, ≤ 30 words, citing the result.")
    question: str = Field(description="One question about the result, ≤ 25 words.")


class ChallengeDecision(BaseModel):
    """React to a colleague's verdict on the last answer."""

    interject: bool = Field(description="Only for a real disagreement or sharper angle.")
    stance: Literal["disagree", "extend", "none"]
    message: str = Field(description="If interjecting: only your question to the student, ≤ 30 words; else empty.")
    file_ref: str = Field(description="If interjecting: listed path; else empty.")
    reasoning: str = Field(description="One sentence.")


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


class ToolRecord(BaseModel):
    """One tool call an agent made, kept as evidence."""

    turn: int = Field(description="1-based transcript turn being judged when the call was made.")
    examiner: Examiner
    tool: ToolName
    args: dict
    summary: str


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


class PreviousAttempt(BaseModel):
    """The viva a retake builds on, so the report can show progress."""
    session_id: str
    overall_score: int
    topics: dict[str, Optional[int]] = Field(description="Topic title -> confidence last time (None = not reached).")


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
    code_checks: list[ToolRecord] = []
    study_plan: list[StudyStep]
    recruiter_summary: str
    questions_asked: int
    previous: Optional[PreviousAttempt] = None  # set on a retake
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
