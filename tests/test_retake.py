"""Re-viva: a shorter viva on the weakest topics of the last attempt, with new questions and progress in the report."""
from agents import llm
from agents.moderator import MAX_RETAKE_TOPICS, RETAKE_BAR
from agents.panel import RETAKE_QUESTIONS_PER_TOPIC, Panel
from agents.schemas import QuestionDecision
from agents.scoring import build_report
from agents.tools import mock_test_runner

VAGUE, GOOD = "It is fast.", ("borrow_book reads available and then updates it in a second query, so two requests can "
                              "both pass the check; a single UPDATE with WHERE available=1 and a rowcount check fixes it.")


def first_attempt(summary, answer=VAGUE):
    panel = Panel(summary, run_tests=mock_test_runner())
    list(panel.start())
    while panel.awaiting_answer:
        list(panel.answer(answer))
    return panel, build_report(summary, panel.state)


def test_retake_plan_targets_the_weakest_topics(summary):
    panel, report = first_attempt(summary)
    retake = Panel.retake(summary, "prev", report, panel.state)
    weak = sorted((t for t in report.topics if t.confidence is not None and t.confidence < RETAKE_BAR),
                  key=lambda t: t.confidence)[:MAX_RETAKE_TOPICS]
    plan = retake.state.plan.topics
    assert [t.title for t in plan] == [t.topic for t in weak]
    previous_plan = {t.title: t for t in panel.state.plan.topics}
    for t in plan:  # same examiner and the same file as last time
        assert (t.examiner, t.file_ref) == (previous_plan[t.title].examiner, previous_plan[t.title].file_ref)
        assert t.why.startswith("Retake: scored")
    assert retake.state.max_questions == RETAKE_QUESTIONS_PER_TOPIC * len(plan)


def test_strong_first_attempt_still_retakes_the_two_lowest(summary):
    panel, report = first_attempt(summary, answer=GOOD)
    for t in report.topics:
        if t.confidence is not None:
            t.confidence = 90
    assert len(Panel.retake(summary, "prev", report, panel.state).state.plan.topics) == 2


def test_retake_runs_to_a_report_with_progress(summary):
    panel, report = first_attempt(summary)
    retake = Panel.retake(summary, "prev123", report, panel.state, run_tests=mock_test_runner())
    events = list(retake.start())
    assert events[0].speaker == "moderator" and events[0].message.startswith("Welcome back")
    assert "/100 last time" in events[0].message
    n = 0
    while retake.awaiting_answer:
        list(retake.answer(GOOD))
        n += 1
    assert n <= retake.state.max_questions
    second = build_report(summary, retake.state)
    assert second.previous.session_id == "prev123"
    assert second.previous.overall_score == report.overall_score
    assert {t.topic for t in second.topics} == {t.title for t in retake.state.plan.topics}
    for t in second.topics:  # good answers on retake beat vague ones
        assert t.confidence > second.previous.topics[t.topic]


def test_retake_rejects_last_times_questions(summary, monkeypatch):
    """The model first repeats last time's question word for word; code asks for a rewrite."""
    panel, report = first_attempt(summary)
    retake = Panel.retake(summary, "prev", report, panel.state)
    topic = retake.state.plan.topics[0]
    old = retake.state.avoid_questions[topic.title][0]
    drafts = iter([old, "What happens to the connection get_connection opens if the request raises halfway?"])
    seen_prompts = []

    def model(system, user, schema, effort=None, fast=False):
        seen_prompts.append(user)
        return QuestionDecision(file_ref=topic.file_ref, question=next(drafts), reasoning="r")

    monkeypatch.setattr(llm, "is_offline", lambda: False)
    monkeypatch.setattr(llm, "structured_call", model)
    q = retake.examiners[topic.examiner].open_topic(topic, [], avoid=retake.state.avoid_questions[topic.title])
    assert "RETAKE" in seen_prompts[0] and old in seen_prompts[0]
    assert "repeats an earlier question" in seen_prompts[1]
    assert old not in q.question
