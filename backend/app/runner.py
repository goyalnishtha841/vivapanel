"""Runs the agents for a session in a background thread and records every event.

    start(sid, repo_url)  ingest the repo, plan the panel, ask the first question
    start_retake(sid, prev)  a shorter viva on the weakest topics of a finished session
    answer(sid, text)     judge the answer and produce the next turn(s); score the report when the viva ends

The HTTP layer never waits on an LLM call: it starts the work here and returns, and the client follows
progress over the event stream.
"""
from __future__ import annotations

import shutil
import threading
from pathlib import Path

from agents import llm
from agents.panel import Panel, PanelState
from agents.schemas import Event, ProjectSummary, Report
from agents.scoring import build_report
from agents.tools import MOCK_REPO, LocalRepoTools, mock_test_runner

from . import config, sandbox, store
from .ingest import IngestError, clone, ingest, parse_repo_url

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


def code_root(sid: str, summary: ProjectSummary) -> Path:
    """Where the session's code lives while the viva runs (the clone is deleted after scoring)."""
    return MOCK_REPO if _is_sample(summary.repo_url) else config.REPOS_DIR / sid


_sandboxes: dict[str, sandbox.Sandbox] = {}


def _sandbox(sid: str, summary: ProjectSummary) -> sandbox.Sandbox | None:
    """The session's test sandbox, created on first use and prepared in the background (installing takes a while)."""
    if sid not in _sandboxes:
        box = sandbox.make(config.REPOS_DIR / sid, summary.files, summary.test_command)
        if box is None:
            return None
        _sandboxes[sid] = box
        box.start()
    return _sandboxes[sid]


def _close_sandbox(sid: str) -> None:
    box = _sandboxes.pop(sid, None)
    if box:
        threading.Thread(target=box.close, daemon=True).start()


def _tools(sid: str, summary: ProjectSummary):
    """(run_tests, repo_tools) for a session: the sample project uses recorded results; real repos a sandbox."""
    if _is_sample(summary.repo_url):
        return mock_test_runner(), LocalRepoTools(MOCK_REPO)
    clone = config.REPOS_DIR / sid
    if not clone.exists():
        return None, None
    box = _sandbox(sid, summary)
    return (box.run if box else None), LocalRepoTools(clone)


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

def start(sid: str, repo_url: str, student: str | None = None) -> None:
    threading.Thread(target=_start, args=(sid, repo_url, student), daemon=True, name=f"start-{sid}").start()


def _start(sid: str, repo_url: str, student: str | None = None) -> None:
    with _lock(sid):
        try:
            if _is_sample(repo_url):
                summary = ProjectSummary.model_validate_json(SAMPLE_SUMMARY.read_text())
            else:
                summary = ingest(repo_url, config.REPOS_DIR / sid, student=student,
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
        _begin(sid, summary, Panel(summary, run_tests=run_tests, repo_tools=repo_tools))


def _begin(sid: str, summary: ProjectSummary, panel: Panel) -> None:
    ok = _run(sid, panel.start(), on_fail="llm_failed")  # nothing to retry yet: the session can't start
    store.update(sid, summary=summary.model_dump_json(), state=panel.to_json(),
                 status="awaiting" if ok and panel.awaiting_answer else "error",
                 error=None if ok else "llm_failed")


# ---------- retake ----------

def can_retake(row: dict) -> bool:
    """A finished viva with at least one topic actually assessed."""
    if not row.get("report") or not row.get("state"):
        return False
    return any(t.confidence is not None for t in Report.model_validate_json(row["report"]).topics)


def start_retake(sid: str, prev_sid: str) -> None:
    threading.Thread(target=_start_retake, args=(sid, prev_sid), daemon=True, name=f"retake-{sid}").start()


def _start_retake(sid: str, prev_sid: str) -> None:
    with _lock(sid):
        prev = store.get_session(prev_sid)
        summary = ProjectSummary.model_validate_json(prev["summary"])  # no new summary call: same project
        if not _is_sample(summary.repo_url):
            _emit(sid, Event(speaker="moderator", message="Fetching your repository again…"))
            try:
                clone(*parse_repo_url(summary.repo_url), config.REPOS_DIR / sid)
            except IngestError as e:
                print(f"[{sid}] retake clone failed ({e.code}); the Engineer won't open files", flush=True)
        run_tests, repo_tools = _tools(sid, summary)
        panel = Panel.retake(summary, prev_sid, Report.model_validate_json(prev["report"]),
                             PanelState.model_validate_json(prev["state"]), run_tests=run_tests, repo_tools=repo_tools)
        store.update(sid, state=panel.to_json())  # the plan and its shorter question limit, before the first question
        _begin(sid, summary, panel)


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
        _close_sandbox(sid)
        shutil.rmtree(config.REPOS_DIR / sid, ignore_errors=True)  # the clone isn't needed after the viva


def retry_report(sid: str) -> None:
    """Re-run scoring for a finished viva whose report failed (e.g. a rate limit)."""
    row = store.get_session(sid)
    threading.Thread(target=lambda: _score(sid, _panel(sid, row)), daemon=True).start()
