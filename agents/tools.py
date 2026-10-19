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
