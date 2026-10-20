"""Viva Panel API (docs/api-contract.md).

    uvicorn backend.app.main:app --reload --port 8000      # from the repo root
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import secrets
import time
import uuid

from fastapi import FastAPI, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from agents import llm
from agents.schemas import ProjectSummary, RoleBrief
from agents.tools import LocalRepoTools

from . import config, runner, store
from .ingest import IngestError, parse_repo_url
from . import authorship

app = FastAPI(title="Viva Panel API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

POLL_S = 0.35        # how often the stream checks for new events
KEEPALIVE_S = 15     # comment line so proxies don't close an idle stream


def error(status: int, code: str, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": code, "detail": detail})


class NewSession(BaseModel):
    repo_url: str = Field(default="", max_length=300)
    student: str | None = Field(default=None, max_length=39)  # team project: the student's GitHub login
    retake_of: str | None = Field(default=None, max_length=40)  # a finished session: retake its weakest topics
    invite: str | None = Field(default=None, max_length=40)     # hiring mode: the candidate's interview link token


class Answer(BaseModel):
    session_id: str
    answer: str = Field(max_length=8000)
    seconds: float | None = Field(default=None, ge=0, le=7200)  # question shown -> answer sent (browser)
    pasted: bool | None = None


class NewInvite(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    company: str = Field(default="", max_length=80)
    focus: list[str] = Field(default=[], max_length=8)


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _role_of(row: dict) -> RoleBrief | None:
    """The job a session screens for (hiring mode), known from the moment the session is created."""
    inv = store.get_invite(row["invite"]) if row.get("invite") else None
    return RoleBrief.model_validate_json(inv["role"]) if inv else None


@app.get("/health")
def health():
    return {"status": "ok", "llm": "offline" if llm.is_offline() else f"{llm.PROVIDER}:{llm.MODEL}"}


@app.get("/contributors")
def list_contributors(repo_url: str):
    """Human contributors of a repo, so a team member can say which one they are before the viva."""
    try:
        owner, name = parse_repo_url(repo_url)
    except IngestError as e:
        return error(400, e.code, e.detail)
    if runner._is_sample(repo_url):
        return {"contributors": []}
    return {"contributors": authorship.contributors(owner, name)}


@app.post("/invites")
def create_invite(body: NewInvite):
    """Hiring mode: an interview link for one candidate, plus a private key for the recruiter's results page."""
    focus = [f.strip()[:40] for f in body.focus if f.strip()]
    role = RoleBrief(title=body.title.strip(), company=body.company.strip(), focus=focus)
    token, key = secrets.token_urlsafe(9), secrets.token_urlsafe(18)
    store.create_invite(token, _hash(key), role.model_dump_json())
    return {"token": token, "key": key}


@app.get("/invites/{token}")
def invite_info(token: str):
    """What the candidate sees before starting: the role, and whether the link was already used."""
    inv = store.get_invite(token)
    if not inv:
        return error(404, "invite_not_found", "This interview link isn't valid.")
    role = RoleBrief.model_validate_json(inv["role"])
    return {"title": role.title, "company": role.company, "focus": role.focus, "used": bool(inv["session_id"]),
            "session_id": inv["session_id"]}


@app.get("/screening/{token}")
def screening(token: str, key: str = ""):
    """The recruiter's results page: status while the viva runs, then the screening report (with transcript)."""
    inv = store.get_invite(token)
    if not inv or not hmac.compare_digest(_hash(key), inv["key_hash"]):
        return error(404, "invite_not_found", "No screening at this link.")
    role = json.loads(inv["role"])
    row = store.get_session(inv["session_id"]) if inv["session_id"] else None
    out = {"role": role, "token": token, "status": row["status"] if row else "not_started",
           "repo_url": row["repo_url"] if row else None, "report": None}
    if row and row["report"]:
        out["report"] = json.loads(row["report"])
    elif row and row["status"] == "error" and (row["error"] or "").startswith("llm_failed") and row["state"]:
        runner.retry_report(inv["session_id"])
        store.update(inv["session_id"], status="scoring", error=None)
        out["status"] = "scoring"
    return out


@app.post("/session")
def create_session(body: NewSession):
    prev = None
    invite = store.get_invite(body.invite) if body.invite else None
    if body.invite and not invite:
        return error(404, "invite_not_found", "This interview link isn't valid.")
    if invite and invite["session_id"]:
        return error(409, "invite_used", "This interview link has already been used.")
    if body.retake_of:
        prev = store.get_session(body.retake_of)
        if not prev:
            return error(404, "session_not_found", "No session with that id.")
        if _role_of(prev):
            return error(409, "retake_not_allowed", "Screening vivas can't be retaken.")
        if not runner.can_retake(prev):
            return error(409, "nothing_to_retake", "Finish the viva first: a retake needs at least one assessed topic.")
    url = prev["repo_url"] if prev else body.repo_url.strip()
    if body.student and not authorship.LOGIN.match(body.student):
        return error(400, "invalid_student", "That isn't a valid GitHub username.")
    if not prev and not runner._is_sample(url):
        try:
            parse_repo_url(url)
        except IngestError as e:
            return error(400, e.code, e.detail)
    if config.DAILY_SESSION_LIMIT and store.sessions_since(time.time() - 86400) >= config.DAILY_SESSION_LIMIT:
        return error(429, "daily_limit", "Today's vivas are used up on this demo. Please try again tomorrow.")
    sid = uuid.uuid4().hex[:12]
    store.create_session(sid, url, invite=body.invite if invite else None)
    if invite and not store.bind_invite(body.invite, sid):
        return error(409, "invite_used", "This interview link has already been used.")
    if prev:
        runner.start_retake(sid, body.retake_of)
    else:
        runner.start(sid, url, student=body.student,
                     role=RoleBrief.model_validate_json(invite["role"]) if invite else None)
    return {"session_id": sid}


@app.get("/session/{sid}")
def session_status(sid: str):
    row = store.get_session(sid)
    if not row:
        return error(404, "session_not_found", "No session with that id.")
    state = json.loads(row["state"]) if row["state"] else {}
    role = _role_of(row)
    return {"session_id": sid, "repo_url": row["repo_url"], "status": row["status"], "error": row["error"],
            "max_questions": state.get("max_questions", 12), "retake_of": (state.get("previous") or {}).get("session_id"),
            "hiring": {"title": role.title, "company": role.company} if role else None}


@app.post("/answer")
def answer(body: Answer):
    row = store.get_session(body.session_id)
    if not row:
        return error(404, "session_not_found", "No session with that id.")
    if row["status"] == "error":
        return error(409, "session_failed", "This session hit an error. Start a new one.")
    try:
        runner.answer(body.session_id, body.answer, seconds=body.seconds, pasted=body.pasted)
    except runner.Busy:
        return error(409, "panel_busy", "The panel is still working on the last turn.")
    return {"ok": True}


@app.get("/stream/{sid}")
async def stream(sid: str, request: Request, last_event_id: str | None = Header(default=None)):
    if not store.get_session(sid):
        return error(404, "session_not_found", "No session with that id.")
    start = int(last_event_id) if last_event_id and last_event_id.isdigit() else 0

    async def events():
        seq, idle = start, 0.0
        yield "retry: 2000\n\n"
        while not await request.is_disconnected():
            rows = store.events_after(sid, seq)
            for seq, data in rows:
                yield f"id: {seq}\ndata: {data}\n\n"
            if rows:
                idle = 0.0
            else:
                idle += POLL_S
                if idle >= KEEPALIVE_S:
                    idle = 0.0
                    yield ": keep-alive\n\n"
            await asyncio.sleep(POLL_S)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/code/{sid}")
def code(sid: str, path: str):
    """One file from the session's repo, for the code viewer beside the question. Only listed repo paths."""
    row = store.get_session(sid)
    if not row:
        return error(404, "session_not_found", "No session with that id.")
    if not row["summary"]:
        return error(409, "not_ready", "The project is still being read.")
    summary = ProjectSummary.model_validate_json(row["summary"])
    if path not in summary.files:
        return error(404, "file_not_found", "That file isn't in this repository.")
    text = LocalRepoTools(runner.code_root(sid, summary)).read_raw(path)
    if text is None:  # clone gone (viva finished) or too large: fall back to the snippet the panel saw
        kf = next((k for k in summary.key_files if k.path == path), None)
        if not kf:
            return error(410, "code_unavailable", "This file is no longer available for this session.")
        return {"path": path, "content": kf.snippet, "partial": True}
    return {"path": path, "content": text, "partial": False}


@app.get("/report/{sid}")
def report(sid: str):
    row = store.get_session(sid)
    if not row:
        return error(404, "session_not_found", "No session with that id.")
    if _role_of(row):  # hiring: the report belongs to the recruiter's private results link
        return error(403, "shared_with_recruiter", "This screening report is shared with the recruiter only.")
    if row["report"]:
        return JSONResponse(json.loads(row["report"]))
    if row["status"] == "error" and (row["error"] or "").startswith("llm_failed") and row["state"]:
        runner.retry_report(sid)
        store.update(sid, status="scoring", error=None)
        return JSONResponse(status_code=202, content={"status": "scoring"})
    if row["status"] in ("scoring",):
        return JSONResponse(status_code=202, content={"status": "scoring"})
    return error(409, "viva_not_finished", "The viva isn't finished yet.")


# Last, so the API routes above win: everything else is the built frontend (hash-routed, so / is enough).
if (config.STATIC_DIR / "index.html").exists():
    app.mount("/", StaticFiles(directory=config.STATIC_DIR, html=True), name="app")
