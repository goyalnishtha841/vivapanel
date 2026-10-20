"""SQLite storage: one row per session, one row per streamed event.

Events are append-only with a per-session sequence number, which doubles as the SSE event id, so a client
that reconnects resumes exactly where it left off.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time

from . import config

_lock = threading.Lock()
_conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
_conn.row_factory = sqlite3.Row
_conn.executescript(
    """
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        repo_url TEXT NOT NULL,
        status TEXT NOT NULL,          -- ingesting | awaiting | thinking | scoring | done | error
        error TEXT,
        summary TEXT,                  -- ProjectSummary JSON
        state TEXT,                    -- PanelState JSON
        report TEXT,                   -- Report JSON
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
        session_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (session_id, seq)
    );
    """
)


def create_session(sid: str, repo_url: str) -> None:
    now = time.time()
    with _lock:
        _conn.execute("INSERT INTO sessions (id, repo_url, status, created_at, updated_at) VALUES (?,?,?,?,?)",
                      (sid, repo_url, "ingesting", now, now))
        _conn.commit()


def sessions_since(ts: float) -> int:
    with _lock:
        return _conn.execute("SELECT COUNT(*) FROM sessions WHERE created_at >= ?", (ts,)).fetchone()[0]


def get_session(sid: str) -> dict | None:
    with _lock:
        row = _conn.execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone()
    return dict(row) if row else None


def update(sid: str, **fields) -> None:
    if not fields:
        return
    fields["updated_at"] = time.time()
    cols = ", ".join(f"{k}=?" for k in fields)
    with _lock:
        _conn.execute(f"UPDATE sessions SET {cols} WHERE id=?", (*fields.values(), sid))
        _conn.commit()


def append_event(sid: str, event: dict) -> int:
    with _lock:
        seq = (_conn.execute("SELECT COALESCE(MAX(seq), 0) FROM events WHERE session_id=?", (sid,)).fetchone()[0]) + 1
        _conn.execute("INSERT INTO events (session_id, seq, data) VALUES (?,?,?)", (sid, seq, json.dumps(event)))
        _conn.commit()
    return seq


def events_after(sid: str, seq: int) -> list[tuple[int, str]]:
    with _lock:
        rows = _conn.execute("SELECT seq, data FROM events WHERE session_id=? AND seq>? ORDER BY seq", (sid, seq)).fetchall()
    return [(r["seq"], r["data"]) for r in rows]
