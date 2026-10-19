"""Terminal viva — run the full panel (or one examiner) without the backend.

    python -m agents.cli                                     # full panel on the mock summary
    python -m agents.cli --summary path/to/summary.json
    python -m agents.cli --only professor                    # single examiner (Day 1 mode)
    VIVA_OFFLINE=1 python -m agents.cli                      # scripted, no API calls

Every Event is printed and appended to runs/<timestamp>.jsonl. Type 'quit' to stop.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from . import llm
from .moderator import ORDER
from .panel import Panel
from .schemas import Event, ProjectSummary

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SUMMARY = Path(__file__).parent / "mock_data" / "mock_summary.json"
COLOURS = {"professor": "\033[35m", "engineer": "\033[36m", "junior": "\033[33m",
           "moderator": "\033[90m", "student": "\033[32m", "system": "\033[31m"}


def show(e: Event, verbose: bool) -> None:
    c, r = COLOURS.get(e.speaker, ""), "\033[0m"
    ref = f"  [{e.file_ref}]" if e.file_ref else ""
    print(f"{c}{e.speaker.upper():>9}{r}: {e.message}{ref}")
    if verbose and e.reasoning and e.speaker != "student":
        print(f"{'':>11}\033[2mwhy: {e.reasoning}{r}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    ap.add_argument("--only", choices=ORDER, help="run a single examiner")
    ap.add_argument("--quiet", action="store_true", help="hide reasoning lines")
    args = ap.parse_args()

    summary = ProjectSummary.model_validate_json(args.summary.read_text())
    panel = Panel(summary, examiners=(args.only,) if args.only else ORDER)

    runs = ROOT / "runs"
    runs.mkdir(exist_ok=True)
    log_path = runs / f"{datetime.now():%Y%m%d-%H%M%S}-{summary.name}.jsonl"
    mode = "OFFLINE (scripted)" if llm.is_offline() else f"LIVE ({llm.MODEL}, effort={llm.EFFORT})"
    print(f"Viva Panel — {summary.name} — {mode}\nLogging to {log_path}\n", file=sys.stderr)

    with log_path.open("w") as log:
        def run(events) -> bool:
            try:
                for e in events:
                    log.write(e.model_dump_json() + "\n")
                    log.flush()
                    if e.speaker != "student":
                        show(e, not args.quiet)
            except llm.LLMError as err:
                show(Event(speaker="system", message=f"Agent call failed: {err}"), True)
                return False
            return True

        if not run(panel.start()):
            return 1
        while panel.awaiting_answer:
            try:
                answer = input("\n   YOU > ").strip()
            except EOFError:
                break
            if answer.lower() == "quit":
                break
            print()
            if not run(panel.answer(answer)):
                return 1

        log.write(json.dumps({"state": json.loads(panel.to_json())}) + "\n")

    print("\n--- Assessments ---", file=sys.stderr)
    for a in panel.state.assessments:
        print(f"[{a.verdict:>9}] {a.examiner:<9} {a.topic} — {a.judgement}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
