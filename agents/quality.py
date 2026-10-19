"""Question-quality metrics for a session log (a list of Event dicts).

    python -m agents.quality docs/evidence/*.json

Used on Day 4 to measure prompt tuning before/after, and usable on any run in runs/.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from .guardrails import ref_problem, word_count
from .schemas import ProjectSummary

EXAMINERS = {"professor", "engineer", "junior"}
DEFAULT_SUMMARY = Path(__file__).parent / "mock_data" / "mock_summary.json"
STOP = set("the a an of to in on and or is are was be it this that you your how what why would could does do "
           "for with when if can from at by as which".split())


def content_words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z_]+", text.lower()) if w not in STOP and len(w) > 2}


def similarity(a: str, b: str) -> float:
    wa, wb = content_words(a), content_words(b)
    return len(wa & wb) / len(wa | wb) if wa and wb else 0.0


def questions(events: list[dict]) -> list[dict]:
    """Examiner turns that ask the student something (excludes the 'running tests' announcement)."""
    return [e for e in events if e.get("speaker") in EXAMINERS and e.get("tool_used") is None
            and not e["message"].startswith("That's all from me")]


def metrics(events: list[dict], summary: ProjectSummary) -> dict:
    qs = questions(events)
    words = [word_count(q["message"]) for q in qs]
    dupes = [
        (i + 1, j + 1) for i in range(len(qs)) for j in range(i + 1, len(qs))
        if similarity(qs[i]["message"], qs[j]["message"]) >= 0.5
    ]
    bad_refs = [q["file_ref"] for q in qs if ref_problem(q.get("file_ref"), summary)]
    n = max(len(qs), 1)
    return {
        "questions": len(qs),
        "avg_words": round(sum(words) / n, 1),
        "max_words": max(words, default=0),
        "over_35_words_pct": round(100 * sum(w > 35 for w in words) / n),
        "multi_question_pct": round(100 * sum(q["message"].count("?") > 1 for q in qs) / n),
        "near_duplicate_pairs": len(dupes),
        "invalid_refs": len(bad_refs),
        "sandbox_runs": sum(1 for e in events if e.get("speaker") == "system" and e.get("tool_used") == "run_tests"),
    }


def load_events(path: Path) -> list[dict]:
    data = json.loads(path.read_text()) if path.suffix == ".json" else [
        json.loads(line) for line in path.read_text().splitlines() if line.startswith('{"speaker"')
    ]
    return [e for e in data if isinstance(e, dict) and "speaker" in e]


def main() -> int:
    summary = ProjectSummary.model_validate_json(DEFAULT_SUMMARY.read_text())
    for p in map(Path, sys.argv[1:]):
        if "report" in p.name:
            continue
        print(p.name, json.dumps(metrics(load_events(p), summary)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
