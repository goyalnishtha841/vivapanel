"""Terminal loop for one examiner — Member A Day 1.

    python -m agents.cli                                   # Professor on the mock summary
    python -m agents.cli --summary path/to/summary.json --role professor
    VIVA_OFFLINE=1 python -m agents.cli                    # no API calls

Every turn is printed in the shared Event format and appended to runs/<timestamp>.jsonl.
Type 'quit' to stop.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from . import llm
from .examiner import Examiner
from .schemas import Event, ProjectSummary

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SUMMARY = Path(__file__).parent / "mock_data" / "mock_summary.json"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    ap.add_argument("--role", default="professor")
    ap.add_argument("--max-turns", type=int, default=12)
    args = ap.parse_args()

    summary = ProjectSummary.model_validate_json(args.summary.read_text())
    examiner = Examiner(args.role, summary)

    runs = ROOT / "runs"
    runs.mkdir(exist_ok=True)
    log_path = runs / f"{datetime.now():%Y%m%d-%H%M%S}-{args.role}.jsonl"
    mode = "OFFLINE (scripted)" if llm.is_offline() else f"LIVE ({llm.MODEL}, effort={llm.EFFORT})"
    print(f"Viva Panel — {args.role} on {summary.name} — {mode}\nLogging to {log_path}\n", file=sys.stderr)

    with log_path.open("w") as log:
        def emit(e: Event) -> None:
            log.write(e.model_dump_json() + "\n")
            log.flush()
            print(e.model_dump_json(indent=2))

        answer: str | None = None
        for _ in range(args.max_turns):
            try:
                event = examiner.ask(answer)
            except llm.LLMError as err:
                emit(Event(speaker="system", message=f"Examiner failed: {err}"))
                return 1
            emit(event)
            if examiner.done:
                break
            try:
                answer = input("\nYour answer> ").strip()
            except EOFError:
                break
            if answer.lower() == "quit":
                break
            emit(Event(speaker="student", message=answer))

        log.write(json.dumps({"assessments": [a.model_dump() for a in examiner.assessments]}) + "\n")

    print("\n--- Assessments ---", file=sys.stderr)
    for a in examiner.assessments:
        print(f"[{a.verdict:>9}] {a.topic} — {a.judgement}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
