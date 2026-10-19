"""Checks that keep examiners grounded in the real repo."""
from __future__ import annotations

from .schemas import ExaminerDecision, ProjectSummary

DONT_KNOW = ("i don't know", "i dont know", "not sure", "no idea", "idk", "pass", "skip")


def split_ref(file_ref: str) -> tuple[str, str | None]:
    path, _, func = file_ref.partition(":")
    return path.strip(), (func.strip() or None)


def file_ref_exists(file_ref: str | None, summary: ProjectSummary) -> bool:
    if not file_ref:
        return False
    path, _ = split_ref(file_ref)
    return path in summary.files


def ensure_question_cites(decision: ExaminerDecision) -> ExaminerDecision:
    """If the question text doesn't name the file or function, prefix it so the student sees the anchor."""
    path, func = split_ref(decision.file_ref)
    basename = path.rsplit("/", 1)[-1]
    q = decision.question
    if basename in q or path in q or (func and func in q):
        return decision
    anchor = f"`{func}()` in `{path}`" if func else f"`{path}`"
    return decision.model_copy(update={"question": f"Looking at {anchor}: {q}"})


def is_non_answer(answer: str) -> bool:
    a = answer.strip().lower()
    return not a or any(a == p or a.startswith(p) for p in DONT_KNOW)
