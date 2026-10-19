"""Checks that keep examiners grounded in the real repo."""
from __future__ import annotations

from .schemas import ProjectSummary

DONT_KNOW = ("i don't know", "i dont know", "not sure", "no idea", "idk", "pass", "skip")


def split_ref(file_ref: str) -> tuple[str, str | None]:
    path, _, func = file_ref.partition(":")
    return path.strip(), (func.strip() or None)


def file_ref_exists(file_ref: str | None, summary: ProjectSummary) -> bool:
    if not file_ref:
        return False
    path, _ = split_ref(file_ref)
    return path in summary.files


def fallback_ref(summary: ProjectSummary) -> str:
    return summary.key_files[0].path if summary.key_files else summary.files[0]


def ensure_question_cites(question: str, file_ref: str) -> str:
    """If the question text doesn't name the file or function, prefix it so the student sees the anchor."""
    path, func = split_ref(file_ref)
    basename = path.rsplit("/", 1)[-1]
    if basename in question or path in question or (func and func in question):
        return question
    anchor = f"`{func}()`" if func else f"`{basename}`"
    return f"On {anchor}: {question}"


def is_non_answer(answer: str) -> bool:
    a = answer.strip().lower()
    return not a or any(a == p or a.startswith(p) for p in DONT_KNOW)
