"""Runs the agents for a session in a background thread and records every event.

    start(sid, repo_url)  ingest the repo, plan the panel, ask the first question
    answer(sid, text)     judge the answer and produce the next turn(s); score the report when the viva ends

The HTTP layer never waits on an LLM call: it starts the work here and returns, and the client follows
progress over the event stream.
"""
from __future__ import annotations

import shutil
import threading
from pathlib import Path

from agents import llm
from agents.panel import Panel
from agents.schemas import Event, ProjectSummary
from agents.scoring import build_report
from agents.tools import MOCK_REPO, LocalRepoTools, mock_test_runner

from . import config, store
from .ingest import IngestError, ingest

# The landing page's "sample project" link. It isn't a real GitHub repo: it's the bundled mock project.
SAMPLE_REPO = "https://github.com/example-student/campus-library-api"
SAMPLE_SUMMARY = Path(__file__).resolve().parents[2] / "agents" / "mock_data" / "mock_summary.json"

_locks: dict[str, threading.Lock] = {}


def _lock(sid: str) -> threading.Lock:
    return _locks.setdefault(sid, threading.Lock())


def _emit(sid: str, event: Event | dict) -> None:
    store.append_event(sid, event.model_dump() if isinstance(event, Event) else event)


def _is_sample(url: str) -> bool:
    return url.rstrip("/").removesuffix(".git").lower() == SAMPLE_REPO


def _tools(sid: str, summary: ProjectSummary):
    """(run_tests, repo_tools) for a session. Real repos get no sandbox until it exists (roadmap step 3)."""
    if _is_sample(summary.repo_url):
        return mock_test_runner(), LocalRepoTools(MOCK_REPO)
    clone = config.REPOS_DIR / sid
    return None, (LocalRepoTools(clone) if clone.exists() else None)


def _panel(sid: str, row: dict) -> Panel:
    summary = ProjectSummary.model_validate_json(row["summary"])
    run_tests, repo_tools = _tools(sid, summary)
    return Panel.from_json(summary, row["state"], run_tests=run_tests, repo_tools=repo_tools)


def _run(sid: str, events, on_fail: str = "retry_answer") -> bool:
    """Drain a panel generator into the event log. False on an LLM failure (already reported to the client)."""
    try:
        for e in events:
            _emit(sid, e)
        return True
    except llm.LLMError as err:
        # The student sees a plain message; the provider's raw error stays in the server log.
        print(f"[{sid}] LLM error: {err}", flush=True)
        _emit(sid, Event(speaker="system", message=friendly(err), reasoning=on_fail))
        return False


def friendly(err: Exception) -> str:
    text = str(err)
    if isinstance(err, llm.RateLimited) and ("per day" in text or "TPD" in text):
        return "The AI provider's daily limit is used up, so the panel can't continue right now. Please try again later."
    if isinstance(err, llm.RateLimited):
        return "The panel is busy right now (rate limit). Wait a few seconds and send your answer again."
    return "The panel couldn't process that answer. Please send it again."


# ---------- start ----------

def start(sid: str, repo_url: str) -> None:
    threading.Thread(target=_start, args=(sid, repo_url), daemon=True, name=f"start-{sid}").start()


def _start(sid: str, repo_url: str) -> None:
    with _lock(sid):
        try:
            if _is_sample(repo_url):
                summary = ProjectSummary.model_validate_json(SAMPLE_SUMMARY.read_text())
            else:
                summary = ingest(repo_url, config.REPOS_DIR / sid,
                                 progress=lambda m: _emit(sid, Event(speaker="moderator", message=m)))
        except IngestError as e:
            _emit(sid, Event(speaker="system", message=e.detail, reasoning=e.code))
            store.update(sid, status="error", error=e.code)
            return
        except llm.LLMError as e:
            print(f"[{sid}] LLM error during ingest: {e}", flush=True)
            _emit(sid, Event(speaker="system", message=friendly(e), reasoning="llm_failed"))
            store.update(sid, status="error", error="llm_failed")
            return

        run_tests, repo_tools = _tools(sid, summary)
        panel = Panel(summary, run_tests=run_tests, repo_tools=repo_tools)
        ok = _run(sid, panel.start(), on_fail="llm_failed")  # nothing to retry yet: the session can't start
        store.update(sid, summary=summary.model_dump_json(), state=panel.to_json(),
                     status="awaiting" if ok and panel.awaiting_answer else "error",
                     error=None if ok else "llm_failed")


# ---------- answer ----------

class Busy(Exception):
    pass


def answer(sid: str, text: str) -> None:
    lock = _lock(sid)
    if not lock.acquire(blocking=False):
        raise Busy()
    row = store.get_session(sid)
    if row["status"] != "awaiting":
        lock.release()
        raise Busy()
    store.update(sid, status="thinking")
    threading.Thread(target=_answer, args=(sid, row, text, lock), daemon=True, name=f"answer-{sid}").start()


def _answer(sid: str, row: dict, text: str, lock: threading.Lock) -> None:
    try:
        panel = _panel(sid, row)
        _run(sid, panel.answer(text))
        store.update(sid, state=panel.to_json(), status="scoring" if panel.done else "awaiting")
        if panel.done:
            _score(sid, panel)
    except Exception as e:  # never leave a session stuck in "thinking"
        _emit(sid, Event(speaker="system", message=f"Something went wrong: {type(e).__name__}. Please try again."))
        store.update(sid, status="awaiting")
        raise
    finally:
        lock.release()


def _score(sid: str, panel: Panel) -> None:
    try:
        report = build_report(panel.summary, panel.state)
        store.update(sid, report=report.model_dump_json(), status="done")
    except llm.LLMError as e:
        store.update(sid, status="error", error=f"llm_failed: {e}")
    finally:
        shutil.rmtree(config.REPOS_DIR / sid, ignore_errors=True)  # the clone isn't needed after the viva


def retry_report(sid: str) -> None:
    """Re-run scoring for a finished viva whose report failed (e.g. a rate limit)."""
    row = store.get_session(sid)
    threading.Thread(target=lambda: _score(sid, _panel(sid, row)), daemon=True).start()
