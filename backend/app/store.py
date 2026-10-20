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
    CREATE TABLE IF NOT EXISTS invites (    -- hiring mode: one interview link per candidate
        token TEXT PRIMARY KEY,                -- in the candidate's link
        key_hash TEXT NOT NULL,                -- sha256 of the recruiter's results key (the key itself isn't stored)
        role TEXT NOT NULL,                    -- RoleBrief JSON
        session_id TEXT,                       -- set once, when the candidate starts
        created_at REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
        session_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (session_id, seq)
    );
    """
)


# hiring mode: which interview link a session came from (added after the first release, hence the migration)
if "invite" not in {r[1] for r in _conn.execute("PRAGMA table_info(sessions)")}:
    _conn.execute("ALTER TABLE sessions ADD COLUMN invite TEXT")
    _conn.commit()


def create_session(sid: str, repo_url: str, invite: str | None = None) -> None:
    now = time.time()
    with _lock:
        _conn.execute("INSERT INTO sessions (id, repo_url, status, created_at, updated_at, invite) VALUES (?,?,?,?,?,?)",
                      (sid, repo_url, "ingesting", now, now, invite))
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


# ---------- hiring invites ----------

def create_invite(token: str, key_hash: str, role_json: str) -> None:
    with _lock:
        _conn.execute("INSERT INTO invites (token, key_hash, role, created_at) VALUES (?,?,?,?)",
                      (token, key_hash, role_json, time.time()))
        _conn.commit()


def get_invite(token: str) -> dict | None:
    with _lock:
        row = _conn.execute("SELECT * FROM invites WHERE token=?", (token,)).fetchone()
    return dict(row) if row else None


def bind_invite(token: str, sid: str) -> bool:
    """Attach the candidate's session; False if the link was already used (one viva per link)."""
    with _lock:
        cur = _conn.execute("UPDATE invites SET session_id=? WHERE token=? AND session_id IS NULL", (sid, token))
        _conn.commit()
    return cur.rowcount == 1
