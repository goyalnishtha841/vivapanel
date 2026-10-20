"""Hiring mode: interview links, a private results page, role-aware planning, per-skill scores and integrity."""
import time

import pytest
from fastapi.testclient import TestClient

from agents import llm
from agents.moderator import Moderator
from agents.panel import Panel
from agents.schemas import PanelPlan, PlannedTopic, ReportNarrative, RoleBrief, Turn
from agents.scoring import _integrity, build_report
from backend.app import main

SAMPLE = "https://github.com/example-student/campus-library-api"
ROLE = {"title": "Backend intern", "company": "Acme", "focus": ["databases", "security", "testing"]}


@pytest.fixture
def client():
    return TestClient(main.app)


def wait(client, sid, statuses, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        st = client.get(f"/session/{sid}").json()["status"]
        if st in statuses:
            return st
        time.sleep(0.05)
    raise AssertionError(st)


def test_full_screening_flow(client):
    made = client.post("/invites", json=ROLE).json()
    token, key = made["token"], made["key"]
    info = client.get(f"/invites/{token}").json()
    assert info["title"] == "Backend intern" and info["used"] is False and "key" not in info

    assert client.get(f"/screening/{token}", params={"key": key}).json()["status"] == "not_started"
    sid = client.post("/session", json={"repo_url": SAMPLE, "invite": token}).json()["session_id"]
    assert client.get(f"/session/{sid}").json()["hiring"] == {"title": "Backend intern", "company": "Acme"}
    while wait(client, sid, {"awaiting", "done"}) == "awaiting":
        client.post("/answer", json={"session_id": sid, "answer": "get_connection opens a new connection per call.",
                                     "seconds": 21.5, "pasted": False})

    r = client.get(f"/screening/{token}", params={"key": key}).json()["report"]
    assert r["hiring"]["title"] == "Backend intern"
    assert [s["skill"] for s in r["skills"]] == ROLE["focus"]
    assert len(r["transcript"]) == r["questions_asked"]
    assert r["integrity"]["answers"] == r["questions_asked"] and r["integrity"]["pasted"] == 0
    assert r["integrity"]["median_seconds"] == 21.5


def test_links_are_single_use_and_results_are_private(client):
    made = client.post("/invites", json=ROLE).json()
    token = made["token"]
    sid = client.post("/session", json={"repo_url": SAMPLE, "invite": token}).json()["session_id"]
    again = client.post("/session", json={"repo_url": SAMPLE, "invite": token})
    assert again.status_code == 409 and again.json()["error"] == "invite_used"
    assert client.get(f"/invites/{token}").json()["used"] is True

    assert client.get(f"/screening/{token}", params={"key": "wrong"}).status_code == 404
    assert client.get(f"/screening/{token}").status_code == 404
    r = client.get(f"/report/{sid}")  # the candidate's session id doesn't open the recruiter's report
    assert r.status_code == 403 and r.json()["error"] == "shared_with_recruiter"
    assert client.post("/session", json={"retake_of": sid}).status_code == 409
    assert client.post("/session", json={"repo_url": SAMPLE, "invite": "nope"}).status_code == 404


@pytest.mark.parametrize("body", [{"title": ""}, {"title": "x" * 81}, {"title": "Dev", "focus": ["a"] * 9}])
def test_invite_validation(client, body):
    assert client.post("/invites", json=body).status_code == 422


def test_role_steers_the_plan(summary, monkeypatch):
    seen = {}

    def model(system, user, schema, effort=None, fast=False):
        seen["user"] = user
        return PanelPlan(topics=[PlannedTopic(examiner="professor", title="t", file_ref="app/db.py", why="w")])

    monkeypatch.setattr(llm, "is_offline", lambda: False)
    monkeypatch.setattr(llm, "structured_call", model)
    Moderator(summary).plan(role=RoleBrief(**ROLE))
    assert "Backend intern" in seen["user"] and "databases, security, testing" in seen["user"]


def test_skill_scores_are_computed_by_code(summary, monkeypatch):
    panel = Panel(summary)
    panel.state.role = RoleBrief(**ROLE)
    list(panel.start())
    while panel.awaiting_answer:
        list(panel.answer("It opens a connection per call."))
    topics = [t.title for t in panel.state.plan.topics]
    narrative = ReportNarrative.model_validate({
        "headline": "h", "topic_notes": [], "weak_spots": [], "study_plan": [], "recruiter_summary": "r",
        "skill_evidence": [{"skill": "Databases", "topics": [topics[0], "Invented topic"]},
                           {"skill": "testing", "topics": []}],
    })
    seen = {}

    def model(system, user, schema, effort=None, fast=False):
        seen["user"] = user
        return narrative

    monkeypatch.setattr(llm, "is_offline", lambda: False)
    monkeypatch.setattr(llm, "structured_call", model)
    report = build_report(summary, panel.state)
    by = {s.skill: s for s in report.skills}
    first = next(t for t in report.topics if t.topic == topics[0])
    assert by["databases"].score == first.confidence and by["databases"].topics == [topics[0]]  # invented topic dropped
    assert by["security"].score is None and by["testing"].score is None
    assert "Hiring screen" in seen["user"] and "fluency" in seen["user"]


def test_integrity_counts():
    t = lambda a, s, p: Turn(examiner="professor", kind="open", topic="t", file_ref="a.py", question="q?",  # noqa: E731
                             answer=a, seconds=s, pasted=p)
    long = "word " * 50
    i = _integrity([t("short", 30, False), t(long, 4, True), t("ok", 12, False), t(None, None, None)])
    assert (i.answers, i.pasted, i.median_seconds, i.fast_long_answers) == (3, 1, 12, 1)
    assert _integrity([t("x", None, None)]) is None
