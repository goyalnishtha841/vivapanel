"""Tool hooks the agents call. The real implementations live in the backend (Member B).

The panel only needs `run_tests`. B passes a function bound to the session's repo:

    def run_tests(test_path: str | None) -> RunTestsResult: ...   # Docker sandbox, no network
    panel = Panel(summary, run_tests=run_tests)

`test_path=None` means "run the whole suite". The function must never raise for a test failure;
sandbox problems come back as status "error" or "timeout".
"""
from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

from .schemas import RunTestsResult

TestRunner = Callable[[str | None], RunTestsResult]

MOCK_RESULTS = Path(__file__).parent / "mock_data" / "mock_test_results.json"


def mock_test_runner(results_file: Path = MOCK_RESULTS) -> TestRunner:
    """Canned results keyed by test path ("" = whole suite). For dev and demos before the sandbox exists."""
    data = json.loads(results_file.read_text())

    def run(test_path: str | None) -> RunTestsResult:
        raw = data.get(test_path or "") or data.get("")
        if raw is None:
            return RunTestsResult(status="error", command=f"pytest -q {test_path or ''}".strip(),
                                  output_tail="no mock result for this path")
        return RunTestsResult.model_validate(raw)

    return run


# ---------- read_file / search_code over a local checkout ----------

MOCK_REPO = Path(__file__).parent / "mock_data" / "campus-library-api"
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".next", "target"}
MAX_FILE_BYTES = 1_000_000


class LocalRepoTools:
    """`read_file` and `search_code` (api-contract §3) over a directory, e.g. B's clone of the student's repo.

    Paths are relative to the repo root; anything resolving outside it is refused.
    """

    def __init__(self, root: Path):
        self.root = Path(root).resolve()

    def _resolve(self, path: str) -> Path | None:
        p = (self.root / path.lstrip("/")).resolve()
        return p if p.is_relative_to(self.root) and p.is_file() else None

    def read_raw(self, path: str) -> str | None:
        """Whole file as text for the UI's code viewer; None if missing, outside the repo, or too large."""
        p = self._resolve(path)
        if p is None or p.stat().st_size > MAX_FILE_BYTES:
            return None
        return p.read_text(errors="replace")

    def read_file(self, path: str, max_lines: int = 120, start_line: int = 1) -> dict:
        p = self._resolve(path)
        if p is None:
            return {"path": path, "error": "file not found in the repository"}
        if p.stat().st_size > MAX_FILE_BYTES:
            return {"path": path, "error": "file too large to read"}
        lines = p.read_text(errors="replace").splitlines()
        start = max(start_line, 1)
        chunk = lines[start - 1 : start - 1 + max_lines]
        return {
            "path": path,
            "content": "\n".join(f"{start + i}: {line}" for i, line in enumerate(chunk)),
            "total_lines": len(lines),
            "truncated": start - 1 + max_lines < len(lines),
        }

    def search_code(self, query: str, max_results: int = 8) -> dict:
        q = query.lower().strip()
        if not q:
            return {"query": query, "matches": [], "error": "empty query"}
        matches = []
        for p in sorted(self.root.rglob("*")):
            if len(matches) >= max_results:
                break
            if not p.is_file() or any(part in SKIP_DIRS for part in p.relative_to(self.root).parts):
                continue
            if p.stat().st_size > MAX_FILE_BYTES:
                continue
            try:
                text = p.read_text()
            except (UnicodeDecodeError, OSError):
                continue  # binary or unreadable
            for n, line in enumerate(text.splitlines(), 1):
                if q in line.lower():
                    matches.append({"path": str(p.relative_to(self.root)), "line": n, "text": line.strip()[:160]})
                    if len(matches) >= max_results:
                        break
        return {"query": query, "matches": matches, "truncated": len(matches) >= max_results}


def mock_repo_tools() -> LocalRepoTools:
    return LocalRepoTools(MOCK_REPO)
