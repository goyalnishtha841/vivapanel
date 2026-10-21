"""Running a public demo safely: per-visitor limits, cleanup of abandoned vivas, and the storage engine."""
from __future__ import annotations

import os
import time

import pytest
from fastapi.testclient import TestClient

from backend.app import config, runner, store
from backend.app.main import app

SAMPLE = "https://github.com/example-student/campus-library-api"


@pytest.fixture
def client():
    return TestClient(app)


def test_one_visitor_cannot_use_up_everyones_quota(client, monkeypatch):
    monkeypatch.setattr(config, "DAILY_PER_VISITOR", 2)
    visitor = f"visitor-{time.time_ns()}"  # a fresh visitor, so earlier runs against the same database don't count
    monkeypatch.setattr(store, "client_id", lambda ip: visitor)
    for _ in range(2):
        assert client.post("/session", json={"repo_url": SAMPLE}).status_code == 200
    r = client.post("/session", json={"repo_url": SAMPLE})
    assert r.status_code == 429 and r.json()["error"] == "visitor_limit"


def test_visitor_ids_are_hashed_not_stored_raw():
    cid = store.client_id("203.0.113.7")
    assert cid and "203" not in cid and len(cid) == 16
    assert store.client_id("203.0.113.7") == cid and store.client_id(None) is None


def test_cleanup_removes_only_idle_repo_copies():
    old = config.REPOS_DIR / "idle-sweep-test"
    fresh = config.REPOS_DIR / "fresh-sweep-test"
    for d in (old, fresh):
        d.mkdir(parents=True, exist_ok=True)
        (d / "README.md").write_text("x")
    long_ago = time.time() - (config.CLEANUP_AFTER_H + 1) * 3600
    os.utime(old, (long_ago, long_ago))
    swept = runner.sweep()
    assert "idle-sweep-test" in swept and not old.exists()
    assert fresh.exists()


def test_health_reports_storage_engine(client):
    assert client.get("/health").json()["storage"] in ("sqlite", "postgres")


def test_store_round_trip():
    sid = f"rt{time.time_ns()}"[:12]
    store.create_session(sid, SAMPLE, client="abc")
    store.update(sid, status="done", report='{"score": 42}')
    assert store.get_session(sid)["report"] == '{"score": 42}'
    assert store.append_event(sid, {"speaker": "moderator"}) == 1
    assert store.append_event(sid, {"speaker": "professor"}) == 2
    assert [s for s, _ in store.events_after(sid, 1)] == [2]
    assert store.sessions_since(time.time() - 60, client="abc") >= 1
