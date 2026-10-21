"""Storage: one row per session, one row per streamed event, one row per interview link.

Two engines, same functions:
  - SQLite (default): one file in backend/data. Zero setup, but on hosts with a throwaway disk (Render's free plan)
    a restart wipes it, and every report link with it.
  - Postgres: set DATABASE_URL (a free Neon or Supabase database) and sessions, reports and interview links
    survive restarts and redeploys.

Events are append-only with a per-session sequence number, which doubles as the SSE event id, so a client
that reconnects resumes exactly where it left off.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time

from . import config

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    repo_url TEXT NOT NULL,
    status TEXT NOT NULL,          -- ingesting | awaiting | thinking | scoring | done | error
    error TEXT,
    summary TEXT,                  -- ProjectSummary JSON
    state TEXT,                    -- PanelState JSON
    report TEXT,                   -- Report JSON
    created_at {real} NOT NULL,
    updated_at {real} NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (    -- hiring mode: one interview link per candidate
    token TEXT PRIMARY KEY,                -- in the candidate's link
    key_hash TEXT NOT NULL,                -- sha256 of the recruiter's results key (the key itself isn't stored)
    role TEXT NOT NULL,                    -- RoleBrief JSON
    session_id TEXT,                       -- set once, when the candidate starts
    created_at {real} NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    session_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (session_id, seq)
);
"""
# Columns added after the first release, so older databases are migrated in place.
LATER_COLUMNS = {"invite": "TEXT", "client": "TEXT"}  # client: a hash of the visitor's IP, for the per-visitor limit


class _SQLite:
    name = "sqlite"

    def __init__(self, path):
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(SCHEMA.format(real="REAL"))
        have = {r[1] for r in self.conn.execute("PRAGMA table_info(sessions)")}
        for col, kind in LATER_COLUMNS.items():
            if col not in have:
                self.conn.execute(f"ALTER TABLE sessions ADD COLUMN {col} {kind}")
        self.conn.commit()

    def run(self, sql: str, params: tuple = ()):
        cur = self.conn.execute(sql, params)
        self.conn.commit()
        return cur

    def one(self, sql, params=()):
        row = self.conn.execute(sql, params).fetchone()
        return dict(row) if row else None

    def all(self, sql, params=()):
        return [dict(r) for r in self.conn.execute(sql, params).fetchall()]


class _Postgres:
    """One autocommit connection, reopened if the server drops it (Neon closes idle connections)."""
    name = "postgres"

    def __init__(self, url: str):
        import psycopg  # only needed when DATABASE_URL is set
        from psycopg.rows import dict_row

        self.psycopg, self.dict_row, self.url = psycopg, dict_row, url
        self.conn = None
        self._connect()
        # REAL in Postgres is 4-byte and would round Unix timestamps; use double precision
        for stmt in [s for s in SCHEMA.format(real="DOUBLE PRECISION").split(";") if s.strip()]:
            self.conn.execute(stmt)
        for col, kind in LATER_COLUMNS.items():
            self.conn.execute(f"ALTER TABLE sessions ADD COLUMN IF NOT EXISTS {col} {kind}")
        self.conn.execute("CREATE INDEX IF NOT EXISTS sessions_created ON sessions (created_at)")

    def _connect(self):
        # prepare_threshold=None: no server-side prepared statements, which connection poolers (Supabase's
        # port 6543, Neon's "-pooler" host) don't support
        self.conn = self.psycopg.connect(self.url, autocommit=True, row_factory=self.dict_row, connect_timeout=10,
                                         prepare_threshold=None)

    def run(self, sql: str, params: tuple = ()):
        sql = sql.replace("?", "%s")
        try:
            return self.conn.execute(sql, params)
        except self.psycopg.OperationalError:
            self._connect()  # dropped connection: reconnect once and retry
            return self.conn.execute(sql, params)

    def one(self, sql, params=()):
        return self.run(sql, params).fetchone()

    def all(self, sql, params=()):
        return self.run(sql, params).fetchall()


def _open():
    url = config.DATABASE_URL
    if url and url.split("://", 1)[0] in ("postgres", "postgresql"):
        return _Postgres(url)
    return _SQLite(config.DB_PATH)


_db = _open()
ENGINE = _db.name


def client_id(ip: str | None) -> str | None:
    """A short, salted hash of the visitor's IP: enough to count their vivas, not enough to recover the address."""
    if not ip:
        return None
    return hashlib.sha256(f"viva-panel:{ip}".encode()).hexdigest()[:16]


def create_session(sid: str, repo_url: str, invite: str | None = None, client: str | None = None) -> None:
    now = time.time()
    with _lock:
        _db.run("INSERT INTO sessions (id, repo_url, status, created_at, updated_at, invite, client) VALUES (?,?,?,?,?,?,?)",
                (sid, repo_url, "ingesting", now, now, invite, client))


def sessions_since(ts: float, client: str | None = None) -> int:
    """New sessions since `ts`, for everyone or (with `client`) for one visitor."""
    with _lock:
        if client:
            row = _db.one("SELECT COUNT(*) AS n FROM sessions WHERE created_at >= ? AND client = ?", (ts, client))
        else:
            row = _db.one("SELECT COUNT(*) AS n FROM sessions WHERE created_at >= ?", (ts,))
    return int(row["n"])


def get_session(sid: str) -> dict | None:
    with _lock:
        return _db.one("SELECT * FROM sessions WHERE id=?", (sid,))


def update(sid: str, **fields) -> None:
    if not fields:
        return
    fields["updated_at"] = time.time()
    cols = ", ".join(f"{k}=?" for k in fields)
    with _lock:
        _db.run(f"UPDATE sessions SET {cols} WHERE id=?", (*fields.values(), sid))


def append_event(sid: str, event: dict) -> int:
    with _lock:
        row = _db.one("SELECT COALESCE(MAX(seq), 0) AS n FROM events WHERE session_id=?", (sid,))
        seq = int(row["n"]) + 1
        _db.run("INSERT INTO events (session_id, seq, data) VALUES (?,?,?)", (sid, seq, json.dumps(event)))
    return seq


def events_after(sid: str, seq: int) -> list[tuple[int, str]]:
    with _lock:
        rows = _db.all("SELECT seq, data FROM events WHERE session_id=? AND seq>? ORDER BY seq", (sid, seq))
    return [(r["seq"], r["data"]) for r in rows]


def unfinished_before(ts: float) -> list[str]:
    """Sessions last touched before `ts` that never finished: abandoned vivas, for the cleanup job."""
    with _lock:
        rows = _db.all("SELECT id FROM sessions WHERE updated_at < ? AND status NOT IN ('done', 'error')", (ts,))
    return [r["id"] for r in rows]


# ---------- hiring invites ----------

def create_invite(token: str, key_hash: str, role_json: str) -> None:
    with _lock:
        _db.run("INSERT INTO invites (token, key_hash, role, created_at) VALUES (?,?,?,?)",
                (token, key_hash, role_json, time.time()))


def get_invite(token: str) -> dict | None:
    with _lock:
        return _db.one("SELECT * FROM invites WHERE token=?", (token,))


def bind_invite(token: str, sid: str) -> bool:
    """Attach the candidate's session; False if the link was already used (one viva per link)."""
    with _lock:
        cur = _db.run("UPDATE invites SET session_id=? WHERE token=? AND session_id IS NULL", (sid, token))
    return cur.rowcount == 1
