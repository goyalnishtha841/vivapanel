"""Token profiler: how many tokens does one full viva send to the model?

    python -m agents.profile_tokens                # prints a per-call table and the session total
    python -m agents.profile_tokens --json out.json

It runs a complete 12-question session on the sample project through the real prompt-building code
(examiners, moderator, Engineer tool loop, scoring) with a scripted student, but every model call goes to a
stand-in that returns plausible decisions instead of calling a provider. For each call it counts exactly
what would be sent: system prompt + user message + JSON schema + tool definitions (o200k tokenizer, the
gpt-oss family's). Free, deterministic and repeatable, so prompt changes can be measured before and after.

It does not measure output tokens or hidden reasoning; use llm.USAGE on a live run for those.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

import tiktoken

from . import llm
from .moderator import Moderator
from .panel import Panel
from .schemas import (
    ChallengeDecision, PanelPlan, ProjectSummary, QuestionDecision, ReportNarrative, RespondDecision, VerifyDecision,
)
from .scoring import build_report
from .tools import mock_repo_tools, mock_test_runner

ENC = tiktoken.get_encoding("o200k_base")
SUMMARY = Path(__file__).parent / "mock_data" / "mock_summary.json"
MESSAGE_OVERHEAD = 8  # role markers per message

# Realistic question text from recorded live sessions (lengths matter, wording doesn't).
QUESTIONS = [
    "Why did you choose plain SHA-256 without a salt for hashing passwords, and what security drawbacks does this design have?",
    "What specific risks does using unsalted SHA-256 pose, and how would adding a salt improve security?",
    "If two students hit borrow_book for the same copy at the same millisecond, what race condition could occur?",
    "How would you modify borrow_book so the availability check and the update happen atomically?",
    "When a user returns a book 7 days late, what integer does calculate_fine return and why?",
    "What does search_books send to SQLite when q contains a single quote, and how would you fix it?",
]
ANSWERS = [
    "It's secure because we hash passwords and use JWT.",
    "hash_password is plain sha256 with no salt, so identical passwords give identical hashes and it's fast to brute "
    "force; bcrypt or argon2 with a per-user salt fixes it, and SECRET_KEY should come from the environment.",
    "SQLite is simple and fast.",
    "get_connection opens a new sqlite3 connection on every call and never closes it, so under load writes queue "
    "on the file lock; I'd move to Postgres with a pool.",
    "It's safe, my tests cover double-borrowing: test_borrow_twice_returns_409 passes.",
    "borrow_book reads available then updates it separately, so two requests can both borrow; one atomic UPDATE "
    "with AND available=1 and a rowcount check fixes it.",
]


def _strict(schema):
    return llm._strict_schema(schema)


def count(text: str) -> int:
    return len(ENC.encode(text))


class StandIn:
    """Returns believable decisions so the panel walks through a full session, and counts every prompt."""

    def __init__(self, summary: ProjectSummary):
        self.summary = summary
        self.calls: list[dict] = []
        self.n = defaultdict(int)

    def __call__(self, kind, system, user, schema, tools):
        schema_tokens = count(json.dumps(_strict(schema)))
        tool_tokens = sum(count(json.dumps({"name": t.name, "description": t.description, "parameters": t.parameters}))
                          for t in (tools or []))
        self.calls.append({
            "call": schema.__name__ + (" (agent)" if kind == "agent" else ""),
            "system": count(system), "user": count(user), "schema": schema_tokens, "tools": tool_tokens,
            "input": count(system) + count(user) + schema_tokens + tool_tokens + 2 * MESSAGE_OVERHEAD,
        })
        i = self.n[schema.__name__]
        self.n[schema.__name__] += 1
        return self.decide(schema, user, i)

    def decide(self, schema, user, i):
        last_ref = (re.findall(r"^Q\d+ .*?\(([^)]+)\):", user, re.M) or [self.summary.key_files[0].path])[-1]
        if schema is PanelPlan:
            return Moderator(self.summary)._offline_plan()
        if schema is QuestionDecision:
            anchor = re.search(r"- Anchor: (\S+)", user)
            return QuestionDecision(file_ref=anchor.group(1) if anchor else last_ref,
                                    question=QUESTIONS[i % len(QUESTIONS)], reasoning="Probing the design choice.")
        if schema is RespondDecision:
            verdict = ["weak", "partial", "strong"][i % 3]
            follow = verdict != "strong"
            claim = i == 5
            return RespondDecision(
                verdict=verdict, judgement="The answer does not address the missing salt or the trade-offs.",
                action="follow_up" if follow else "yield", file_ref=last_ref if follow else "",
                question=QUESTIONS[(i + 1) % len(QUESTIONS)] if follow else "", reasoning="Digging deeper.",
                testable_claim="My tests cover double-borrowing." if claim else "",
                test_path="tests/test_loans.py" if claim else "")
        if schema is ChallengeDecision:
            path = re.search(r"file `([^`]+)`", user)
            first = i == 0
            return ChallengeDecision(interject=first, stance="extend" if first else "none",
                                     message=QUESTIONS[2] if first else "", file_ref=(path.group(1) if path else "") if first else "",
                                     reasoning="The answer missed behaviour under load.")
        if schema is VerifyDecision:
            return VerifyDecision(outcome="inconclusive", explanation="Both tests pass but borrow sequentially.",
                                  question="How would you test two concurrent borrows?")
        if schema is ReportNarrative:
            return ReportNarrative(headline="Basic grasp, weak on concurrency.", topic_notes=[], weak_spots=[],
                                   study_plan=[], recruiter_summary="Understands hashing basics; not concurrency.")
        raise TypeError(schema)


def profile(summary_path: Path = SUMMARY) -> dict:
    summary = ProjectSummary.model_validate_json(summary_path.read_text())
    stand_in = StandIn(summary)

    def fake_call(system, user, schema, effort=None, fast=False):
        return stand_in("structured", system, user, schema, None)

    def fake_loop(system, user, tools, execute, final, max_tool_calls=3, fast=False):
        return stand_in("agent", system, user, final, tools)
        yield  # a generator, like the real agent loop

    saved = (llm.structured_call, llm.agent_loop)
    llm.structured_call, llm.agent_loop = fake_call, fake_loop
    try:
        panel = Panel(summary, run_tests=mock_test_runner(), repo_tools=mock_repo_tools())
        list(panel.start())
        k = 0
        while panel.awaiting_answer:
            list(panel.answer(ANSWERS[k % len(ANSWERS)]))
            k += 1
        build_report(summary, panel.state)
    finally:
        llm.structured_call, llm.agent_loop = saved

    by: dict[str, dict] = defaultdict(lambda: {"calls": 0, "input": 0, "system": 0, "user": 0, "schema": 0, "tools": 0})
    for c in stand_in.calls:
        b = by[c["call"]]
        b["calls"] += 1
        for f in ("input", "system", "user", "schema", "tools"):
            b[f] += c[f]
    total = sum(c["input"] for c in stand_in.calls)
    return {"questions": len(panel.state.transcript), "answers": k, "calls": len(stand_in.calls),
            "input_tokens": total, "by_call": dict(by), "per_call": stand_in.calls}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", type=Path)
    ap.add_argument("--summary", type=Path, default=SUMMARY, help="a ProjectSummary JSON (default: the sample project)")
    args = ap.parse_args()
    r = profile(args.summary)
    print(f"{r['questions']} questions, {r['calls']} model calls, {r['input_tokens']:,} input tokens per session\n")
    print(f"{'call':<26}{'n':>4}{'input':>9}{'avg':>7}   system / user / schema / tools")
    for name, b in sorted(r["by_call"].items(), key=lambda kv: -kv[1]["input"]):
        print(f"{name:<26}{b['calls']:>4}{b['input']:>9,}{b['input'] // b['calls']:>7}   "
              f"{b['system']:,} / {b['user']:,} / {b['schema']:,} / {b['tools']:,}")
    if args.json:
        args.json.write_text(json.dumps(r, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
