"""Viva Panel API (docs/api-contract.md).

    uvicorn backend.app.main:app --reload --port 8000      # from the repo root
"""
from __future__ import annotations

import asyncio
import json
import uuid

from fastapi import FastAPI, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from agents import llm

from . import config, runner, store
from .ingest import IngestError, parse_repo_url

app = FastAPI(title="Viva Panel API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

POLL_S = 0.35        # how often the stream checks for new events
KEEPALIVE_S = 15     # comment line so proxies don't close an idle stream


def error(status: int, code: str, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": code, "detail": detail})


class NewSession(BaseModel):
    repo_url: str = Field(max_length=300)


class Answer(BaseModel):
    session_id: str
    answer: str = Field(max_length=8000)


@app.get("/health")
def health():
    return {"status": "ok", "llm": "offline" if llm.is_offline() else f"{llm.PROVIDER}:{llm.MODEL}"}


@app.post("/session")
def create_session(body: NewSession):
    url = body.repo_url.strip()
    if not runner._is_sample(url):
        try:
            parse_repo_url(url)
        except IngestError as e:
            return error(400, e.code, e.detail)
    sid = uuid.uuid4().hex[:12]
    store.create_session(sid, url)
    runner.start(sid, url)
    return {"session_id": sid}


@app.get("/session/{sid}")
def session_status(sid: str):
    row = store.get_session(sid)
    if not row:
        return error(404, "session_not_found", "No session with that id.")
    return {"session_id": sid, "repo_url": row["repo_url"], "status": row["status"], "error": row["error"]}


@app.post("/answer")
def answer(body: Answer):
    row = store.get_session(body.session_id)
    if not row:
        return error(404, "session_not_found", "No session with that id.")
    if row["status"] == "error":
        return error(409, "session_failed", "This session hit an error. Start a new one.")
    try:
        runner.answer(body.session_id, body.answer)
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


@app.get("/report/{sid}")
def report(sid: str):
    row = store.get_session(sid)
    if not row:
        return error(404, "session_not_found", "No session with that id.")
    if row["report"]:
        return JSONResponse(json.loads(row["report"]))
    if row["status"] == "error" and (row["error"] or "").startswith("llm_failed") and row["state"]:
        runner.retry_report(sid)
        store.update(sid, status="scoring", error=None)
        return JSONResponse(status_code=202, content={"status": "scoring"})
    if row["status"] in ("scoring",):
        return JSONResponse(status_code=202, content={"status": "scoring"})
    return error(409, "viva_not_finished", "The viva isn't finished yet.")
