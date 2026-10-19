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

Verdict = Literal["strong", "partial", "weak", "no_answer", "not_applicable"]


class ExaminerDecision(BaseModel):
    """Structured output the examiner LLM returns every turn."""

    verdict: Verdict = Field(
        description="How well the student's LAST answer matched the actual code. "
        "'not_applicable' only on the very first question."
    )
    judgement: str = Field(
        description="One or two sentences comparing the answer with the code. Empty on the first question."
    )
    action: Literal["follow_up", "new_topic", "end"] = Field(
        description="follow_up = dig deeper on the same topic; new_topic = move on; end = all topics covered."
    )
    topic: str = Field(description="Short label of the topic this question belongs to.")
    file_ref: str = Field(description="Exact repo path, optionally ':function', taken from the file list.")
    question: str = Field(description="The single question to ask now. Max 2 sentences.")
    reasoning: str = Field(description="Why this question, in one sentence, for the reasoning sidebar.")


class Assessment(BaseModel):
    """Per-answer record kept for the scoring agent (Day 3)."""

    examiner: Speaker
    topic: str
    file_ref: Optional[str]
    question: str
    answer: str
    verdict: Verdict
    judgement: str
    timestamp: str = Field(default_factory=now_iso)
