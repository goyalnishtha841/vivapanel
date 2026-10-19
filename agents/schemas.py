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


class ChallengeDecision(BaseModel):
    """A different examiner reacting to a colleague's judgement of the last answer."""

    interject: bool = Field(description="True only if you have a substantive disagreement or a sharper angle.")
    stance: Literal["disagree", "extend", "none"] = Field(
        description="disagree = you think the colleague's verdict was wrong; extend = their verdict stands but "
        "the answer misses something in your lane; none = not interjecting."
    )
    message: str = Field(
        description="If interjecting: a short clause to the colleague by role, then one question to the STUDENT "
        "on the same topic. Max 2 sentences, max 40 words. Empty otherwise."
    )
    file_ref: str = Field(description="If interjecting: exact repo path from the file list. Empty otherwise.")
    reasoning: str = Field(description="One sentence for the reasoning sidebar.")


class Turn(BaseModel):
    """One question and its answer, in the panel's shared memory."""

    examiner: Examiner
    kind: Literal["open", "follow_up", "challenge"]
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
