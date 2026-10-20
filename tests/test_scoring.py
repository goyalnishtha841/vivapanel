"""Scores, readiness and evidence are computed by code, never generated."""
from agents import scoring
from agents.panel import PanelState
from agents.schemas import PanelPlan, PlannedTopic, RunTestsResult, Turn, Verification


def turn(topic, verdict, answer="an answer", examiner="professor", kind="open"):
    return Turn(examiner=examiner, kind=kind, topic=topic, file_ref="app/auth.py", question=f"Q about {topic}?",
                answer=answer, verdict=verdict)


def state(*turns, plan_titles=(), verifications=()):
    plan = PanelPlan(topics=[PlannedTopic(examiner="professor", title=t, file_ref="app/auth.py", why="w")
                             for t in plan_titles])
    return PanelState(examiners=["professor", "engineer", "junior"], plan=plan, transcript=list(turns),
                      verifications=list(verifications))


def scores(st):
    return {t.topic: t.confidence for t in scoring._topic_scores(st)}


def test_single_verdict_weights():
    st = state(turn("a", "strong"), turn("b", "partial"), turn("c", "weak"), turn("d", "no_answer"))
    assert scores(st) == {"a": 100, "b": 55, "c": 20, "d": 0}


def test_later_answers_weigh_more():
    recovered = scores(state(turn("t", "weak"), turn("t", "strong", kind="follow_up")))["t"]
    collapsed = scores(state(turn("t", "strong"), turn("t", "weak", kind="follow_up")))["t"]
    assert recovered == round((0.2 * 1 + 1.0 * 2) / 3 * 100) == 73
    assert collapsed == round((1.0 * 1 + 0.2 * 2) / 3 * 100) == 47
    assert recovered > collapsed


def test_not_applicable_is_ignored_and_unreached_topics_are_none():
    st = state(turn("t", "not_applicable"), turn("t", "strong"), plan_titles=("t", "never reached"))
    assert scores(st) == {"t": 100, "never reached": None}


def test_contradicted_claim_costs_points_and_never_goes_negative():
    result = RunTestsResult(status="failed", command="pytest", passed=1, failed=1)
    v = Verification(turn=1, claim="tests cover it", test_path=None, result=result, outcome="contradicted",
                     explanation="a test failed")
    assert scores(state(turn("t", "partial"), verifications=[v]))["t"] == 55 - scoring.CONTRADICTED_PENALTY
    assert scores(state(turn("t", "no_answer"), verifications=[v]))["t"] == 0


def test_readiness_thresholds():
    r = scoring._readiness
    assert (r(80, 3), r(79, 3), r(60, 3), r(59, 3), r(40, 3), r(39, 3)) == \
        ("ready", "almost_ready", "almost_ready", "needs_work", "needs_work", "not_ready")
    # one topic is not enough evidence to call anyone ready
    assert r(100, 1) == "needs_work" and r(50, 1) == "not_ready"


def test_quotes_are_copied_from_the_transcript_and_clipped():
    long = "word " * 200
    st = state(turn("t", "weak", answer=long))
    quotes = scoring._quotes_for_turn(st.transcript, 1)
    assert quotes[0].text == "Q about t?" and quotes[1].speaker == "student"
    assert len(quotes[1].text) <= scoring.QUOTE_CHARS and quotes[1].text.endswith("…")


def test_unanswered_lists_no_answers_and_open_questions():
    st = state(turn("a", "no_answer", answer="idk"), turn("b", "strong"), turn("c", None, answer=None))
    assert [u.turn for u in scoring._unanswered(st.transcript)] == [1, 3]


def test_build_report_validates_model_references(summary, monkeypatch):
    """The narrative may only cite real turns and files; anything else is dropped by code."""
    from agents import llm
    from agents.schemas import ReportNarrative

    bogus = ReportNarrative.model_validate({
        "headline": "h", "topic_notes": [], "recruiter_summary": "r",
        "weak_spots": [{"title": "w", "file_ref": "app/invented.py", "why": "y", "turns": [1, 99]}],
        "study_plan": [{"title": "s", "action": "a", "file_ref": "app/db.py", "minutes": 9999},
                       {"title": "s2", "action": "a", "file_ref": "nope.py", "minutes": 1}],
    })
    monkeypatch.setattr(llm, "is_offline", lambda: False)
    monkeypatch.setattr(llm, "structured_call", lambda *a, **k: bogus)
    report = scoring.build_report(summary, state(turn("t", "weak"), plan_titles=("t",)))

    spot = report.weak_spots[0]
    assert spot.file_ref is None                      # invented file dropped
    assert {q.turn for q in spot.evidence} == {1}     # turn 99 doesn't exist, so no quote for it
    assert [s.minutes for s in report.study_plan] == [180, 5]          # clamped
    assert [s.file_ref for s in report.study_plan] == ["app/db.py", None]
    assert report.overall_score == 20 and report.readiness == "not_ready"
