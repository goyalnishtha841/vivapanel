"""The HTTP API end to end, offline: start a viva on the sample project, answer every question, get the report."""
import time

import pytest
from fastapi.testclient import TestClient

from backend.app import config, main, store

SAMPLE = "https://github.com/example-student/campus-library-api"


@pytest.fixture
def client():
    return TestClient(main.app)


def wait_for(client, sid, statuses, timeout=15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        st = client.get(f"/session/{sid}").json()["status"]
        if st in statuses:
            return st
        time.sleep(0.05)
    raise AssertionError(f"session {sid} stuck in {st}")


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok", "llm": "offline"}


def test_full_viva_over_http(client):
    sid = client.post("/session", json={"repo_url": SAMPLE}).json()["session_id"]
    assert wait_for(client, sid, {"awaiting", "error"}) == "awaiting"
    assert client.get(f"/report/{sid}").status_code == 409  # not finished yet

    answers = 0
    while (st := wait_for(client, sid, {"awaiting", "done", "error"})) == "awaiting":
        r = client.post("/answer", json={"session_id": sid, "answer": "It reads then updates in two queries."})
        assert r.status_code == 200, r.text
        answers += 1
        assert answers <= 20
    assert st == "done"

    report = client.get(f"/report/{sid}")
    assert report.status_code == 200
    body = report.json()
    assert body["questions_asked"] == answers and 0 <= body["overall_score"] <= 100

    events = [e for _, e in store.events_after(sid, 0)]
    seqs = [s for s, _ in store.events_after(sid, 0)]
    assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs)  # ordered, no gaps reused
    assert store.events_after(sid, seqs[-1]) == []  # Last-Event-ID resume returns nothing new
    assert any('"speaker":"student"' in e.replace(" ", "") for e in events)


def test_answer_while_panel_is_busy_is_rejected(client):
    sid = client.post("/session", json={"repo_url": SAMPLE}).json()["session_id"]
    wait_for(client, sid, {"awaiting"})
    store.update(sid, status="thinking")
    r = client.post("/answer", json={"session_id": sid, "answer": "x"})
    assert r.status_code == 409 and r.json()["error"] == "panel_busy"


@pytest.mark.parametrize("path, method", [("/session/nope", "get"), ("/report/nope", "get"), ("/stream/nope", "get")])
def test_unknown_session_is_404(client, path, method):
    r = getattr(client, method)(path)
    assert r.status_code == 404 and r.json()["error"] == "session_not_found"


def test_answer_to_unknown_session_is_404(client):
    r = client.post("/answer", json={"session_id": "nope", "answer": "x"})
    assert r.status_code == 404


@pytest.mark.parametrize("url", ["not a url", "https://gitlab.com/a/b", "github.com/a"])
def test_invalid_repo_link_is_400(client, url):
    r = client.post("/session", json={"repo_url": url})
    assert r.status_code == 400 and r.json()["error"] == "invalid_url"


def test_oversized_answer_is_rejected(client):
    r = client.post("/answer", json={"session_id": "x", "answer": "a" * 9000})
    assert r.status_code == 422


def test_daily_session_cap(client, monkeypatch):
    monkeypatch.setattr(config, "DAILY_SESSION_LIMIT", store.sessions_since(time.time() - 86400) + 1)
    assert client.post("/session", json={"repo_url": SAMPLE}).status_code == 200
    r = client.post("/session", json={"repo_url": SAMPLE})
    assert r.status_code == 429 and r.json()["error"] == "daily_limit"


def finish_viva(client, answer="It reads then updates in two queries."):
    sid = client.post("/session", json={"repo_url": SAMPLE}).json()["session_id"]
    while wait_for(client, sid, {"awaiting", "done", "error"}) == "awaiting":
        client.post("/answer", json={"session_id": sid, "answer": answer})
    return sid


def test_retake_over_http(client):
    first = finish_viva(client)
    sid = client.post("/session", json={"retake_of": first}).json()["session_id"]
    assert sid != first
    while wait_for(client, sid, {"awaiting", "done", "error"}) == "awaiting":
        client.post("/answer", json={"session_id": sid, "answer": "borrow_book checks then updates separately."})
    report = client.get(f"/report/{sid}").json()
    assert report["previous"]["session_id"] == first
    assert report["repo_url"] == SAMPLE


def test_retake_needs_a_finished_viva(client):
    assert client.post("/session", json={"retake_of": "nope"}).status_code == 404
    sid = client.post("/session", json={"repo_url": SAMPLE}).json()["session_id"]
    wait_for(client, sid, {"awaiting"})
    r = client.post("/session", json={"retake_of": sid})
    assert r.status_code == 409 and r.json()["error"] == "nothing_to_retake"


def test_session_info_reports_the_question_limit(client):
    first = finish_viva(client)
    assert client.get(f"/session/{first}").json()["max_questions"] == 12
    sid = client.post("/session", json={"retake_of": first}).json()["session_id"]
    wait_for(client, sid, {"awaiting"})
    info = client.get(f"/session/{sid}").json()
    assert info["retake_of"] == first and info["max_questions"] < 12


def test_contributors_endpoint(client, monkeypatch):
    from backend.app import authorship
    assert client.get("/contributors", params={"repo_url": SAMPLE}).json() == {"contributors": []}
    assert client.get("/contributors", params={"repo_url": "nope"}).status_code == 400
    monkeypatch.setattr(authorship, "contributors", lambda o, n: [{"login": "asha", "commits": 3, "avatar_url": ""}])
    assert client.get("/contributors", params={"repo_url": "https://github.com/a/b"}).json()["contributors"][0]["login"] == "asha"


def test_invalid_student_login_is_400(client):
    r = client.post("/session", json={"repo_url": "https://github.com/a/b", "student": "../etc"})
    assert r.status_code == 400 and r.json()["error"] == "invalid_student"


def test_code_viewer_serves_only_repo_files(client):
    sid = client.post("/session", json={"repo_url": SAMPLE}).json()["session_id"]
    wait_for(client, sid, {"awaiting"})
    r = client.get(f"/code/{sid}", params={"path": "app/db.py"})
    assert r.status_code == 200 and "def get_connection" in r.json()["content"] and not r.json()["partial"]
    for bad in ["../../../etc/passwd", "/etc/passwd", "app/../../agents/llm.py", "app/nope.py"]:
        assert client.get(f"/code/{sid}", params={"path": bad}).status_code == 404, bad
    assert client.get("/code/nope", params={"path": "app/db.py"}).status_code == 404
