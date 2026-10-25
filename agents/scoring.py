"""Scoring agent: turns a finished panel session into an evidence-backed Report.

Split of work, so the report can be trusted:
- Code computes every number (topic confidence, overall score, readiness) from the examiners'
  verdicts, collects unanswered questions, and pulls exact quotes from the transcript.
- One LLM call writes the judgement: weak spots (pointing at turn numbers), topic notes,
  the study plan and the recruiter summary. Turn numbers and files it cites are validated, and the
  quotes shown next to them are taken from the transcript, never from the model.

    report = build_report(summary, panel.state)
    report_to_markdown(report)
"""
from __future__ import annotations

from pathlib import Path

from . import llm
from .examiner import DISPLAY, render_summary
from .guardrails import clip_answer, file_ref_exists, split_ref
from .panel import WARMUP_TOPIC, PanelState
from .schemas import (
    Integrity, ProjectSummary, SkillScore, Quote, Report, ReportNarrative, StudyStep, TopicScore, Turn, UnansweredQuestion, Verdict,
    WeakSpot,
)

PROMPTS = Path(__file__).parent / "prompts"
VERDICT_WEIGHT: dict[str, float] = {"strong": 1.0, "partial": 0.55, "weak": 0.2, "no_answer": 0.0}
CONTRADICTED_PENALTY = 15
QUOTE_CHARS = 220


def build_report(summary: ProjectSummary, state: PanelState) -> Report:
    transcript = state.transcript
    topics = _topic_scores(state)
    covered = [t.confidence for t in topics if t.confidence is not None]
    overall = round(sum(covered) / len(covered)) if covered else 0
    narrative = _offline_narrative(summary, state, topics) if llm.is_offline() else _llm_narrative(summary, state, topics)

    if summary.student:
        focus = set(summary.student.focus())
        for t in topics:
            t.own_work = bool(t.file_ref) and split_ref(t.file_ref)[0] in focus
    notes = {n.topic: n.note for n in narrative.topic_notes}
    for t in topics:
        t.note = notes.get(t.topic, t.note)

    weak_spots = []
    for w in narrative.weak_spots:
        turns = [n for n in w.turns if 1 <= n <= len(transcript)]
        weak_spots.append(WeakSpot(
            title=w.title,
            file_ref=w.file_ref if file_ref_exists(w.file_ref, summary) else None,
            why=w.why,
            evidence=[q for n in turns for q in _quotes_for_turn(transcript, n)],
        ))

    return Report(
        repo_url=summary.repo_url,
        project=summary.name,
        overall_score=overall,
        readiness=_readiness(overall, len(covered)),
        headline=narrative.headline,
        topics=topics,
        weak_spots=weak_spots,
        unanswered=_unanswered(transcript),
        test_evidence=state.verifications,
        code_checks=state.tool_calls,
        study_plan=[
            StudyStep(title=s.title, action=s.action, minutes=max(5, min(s.minutes, 180)),
                      file_ref=s.file_ref if file_ref_exists(s.file_ref, summary) else None)
            for s in narrative.study_plan
        ],
        recruiter_summary=narrative.recruiter_summary,
        questions_asked=len(transcript),
        skipped_count=len(_skipped(transcript)),
        skipped_by_difficulty=_skipped_by_difficulty(transcript),
        interview_tips=narrative.interview_tips,
        baseline_tests=state.baseline_tests,
        previous=state.previous,
        student=summary.student,
        hiring=state.role,
        integrity=_integrity(transcript),
        skills=_skill_scores(state.role, narrative, topics),
        transcript=transcript if state.role else [],
    )


# ---------- numbers (code, not the model) ----------

def _topic_scores(state: PanelState) -> list[TopicScore]:
    order: list[str] = [t.title for t in (state.plan.topics if state.plan else [])]
    for t in state.transcript:
        if t.topic not in order and t.topic != WARMUP_TOPIC:  # the icebreaker is never graded or scored
            order.append(t.topic)
    planned = {t.title: t for t in (state.plan.topics if state.plan else [])}
    contradicted = {state.transcript[v.turn - 1].topic for v in state.verifications if v.outcome == "contradicted"}

    scores = []
    for title in order:
        turns = [(i, t) for i, t in enumerate(state.transcript, 1) if t.topic == title]
        verdicts: list[Verdict] = [t.verdict for _, t in turns if t.verdict and t.verdict != "not_applicable"]
        first = turns[0][1] if turns else None
        examiner = first.examiner if first else planned[title].examiner
        file_ref = (first.file_ref if first else None) or (planned[title].file_ref if title in planned else None)
        if not verdicts:
            scores.append(TopicScore(topic=title, examiner=examiner, file_ref=file_ref, confidence=None,
                                     verdicts=[], note="Not reached in this session."))
            continue
        # Later answers count more: a student who recovers after a follow-up has shown understanding.
        weights = range(1, len(verdicts) + 1)
        conf = sum(VERDICT_WEIGHT[v] * w for v, w in zip(verdicts, weights, strict=True)) / sum(weights) * 100
        if title in contradicted:
            conf -= CONTRADICTED_PENALTY
        scores.append(TopicScore(
            topic=title, examiner=examiner, file_ref=file_ref, confidence=max(0, round(conf)), verdicts=verdicts,
            evidence=[q for i, t in turns if t.answer for q in _quotes_for_turn(state.transcript, i)][:3],
        ))
    return scores


def _skill_scores(role, narrative: ReportNarrative, topics: list[TopicScore]) -> list[SkillScore]:
    """The model only says which topics tested which skill; the score is the mean of those topics' confidence."""
    if not role:
        return []
    conf = {t.topic: t.confidence for t in topics}
    mapped = {s.skill.strip().lower(): s.topics for s in narrative.skill_evidence}
    out = []
    for skill in role.focus:
        names = [n for n in mapped.get(skill.strip().lower(), []) if conf.get(n) is not None]
        scores = [conf[n] for n in names]
        out.append(SkillScore(skill=skill, score=round(sum(scores) / len(scores)) if scores else None, topics=names))
    return out


def _integrity(transcript: list[Turn]) -> Integrity | None:
    """Only from what the browser reported; None when nothing was reported (CLI, evals, older sessions)."""
    timed = [t for t in transcript if t.answer and t.seconds is not None]
    if not timed:
        return None
    secs = sorted(t.seconds for t in timed)
    mid = len(secs) // 2
    return Integrity(
        answers=len(timed), pasted=sum(bool(t.pasted) for t in timed),
        median_seconds=round(secs[mid] if len(secs) % 2 else (secs[mid - 1] + secs[mid]) / 2, 1),
        fast_long_answers=sum(1 for t in timed if t.seconds < 10 and len(t.answer.split()) > 40),
    )


def _readiness(score: int, topics_covered: int) -> str:
    if topics_covered < 2:
        return "not_ready" if score < 60 else "needs_work"
    if score >= 80:
        return "ready"
    if score >= 60:
        return "almost_ready"
    if score >= 40:
        return "needs_work"
    return "not_ready"


def _quotes_for_turn(transcript: list[Turn], n: int) -> list[Quote]:
    t = transcript[n - 1]
    out = [Quote(turn=n, speaker=t.examiner, text=_clip(t.question))]
    if t.answer is not None:
        out.append(Quote(turn=n, speaker="student", text=_clip(t.answer)))
    return out


def _clip(text: str) -> str:
    return text if len(text) <= QUOTE_CHARS else text[: QUOTE_CHARS - 1].rsplit(" ", 1)[0] + "…"


def _skipped(transcript: list[Turn]) -> list[Turn]:
    return [t for t in transcript if t.skipped]


def _skipped_by_difficulty(transcript: list[Turn]) -> dict[str, int]:
    counts = {"fundamentals": 0, "intermediate": 0, "advanced": 0}
    for t in _skipped(transcript):
        counts[t.difficulty] += 1
    return counts


def _unanswered(transcript: list[Turn]) -> list[UnansweredQuestion]:
    return [
        UnansweredQuestion(turn=i, examiner=t.examiner, question=t.question, file_ref=t.file_ref,
                           answer=t.answer if t.answer is not None else "(session ended before an answer)")
        for i, t in enumerate(transcript, 1)
        if t.answer is None or t.verdict == "no_answer"
    ]


# ---------- narrative (the model) ----------

def _render_for_scorer(state: PanelState, topics: list[TopicScore]) -> str:
    lines = []
    if state.baseline_tests:
        b = state.baseline_tests
        lines.append(f"## Baseline: the project's own tests, run once before any question was asked\n"
                     f"{b.status}, {b.passed} passed, {b.failed} failed" +
                     (f" (failing: {', '.join(b.failing_tests[:5])})" if b.failing_tests else "") +
                     ". Treat this as ground truth: if a student's answer claims a feature works and the baseline "
                     "shows its test failing (or vice versa), that contradiction is important evidence — use it.\n")
    lines.append("## Transcript")
    for i, t in enumerate(state.transcript, 1):
        lines.append(f"Q{i} {DISPLAY[t.examiner]} [{t.kind}, topic: {t.topic}] ({t.file_ref}): {t.question}")
        lines.append(f"A{i} Student: " + (f"«{clip_answer(t.answer)}»" if t.answer is not None else "(no answer — session ended)"))
        if t.verdict:
            lines.append(f"   ↳ verdict: {t.verdict} — {t.judgement}")
    lines.append("\n## Sandbox test runs")
    if not state.verifications:
        lines.append("(none)")
    for v in state.verifications:
        r = v.result
        lines.append(f"After A{v.turn}: claim \"{v.claim}\" → ran `{r.command}`: {r.status}, {r.passed} passed, "
                     f"{r.failed} failed {r.failing_tests} → {v.outcome}: {v.explanation}")
    lines.append("\n## Code checks the Engineer made (tool calls)")
    if not state.tool_calls:
        lines.append("(none)")
    for c in state.tool_calls:
        lines.append(f"While judging A{c.turn}: {c.tool}({c.args}) → {c.summary}")
    lines.append("\n## Topic confidence (computed from verdicts)")
    for t in topics:
        lines.append(f"- {t.topic} ({DISPLAY[t.examiner]}): "
                     + (f"{t.confidence}/100, verdicts {t.verdicts}" if t.confidence is not None else "not reached"))
    if state.role:
        r = state.role
        lines.append(f"\n## Hiring screen\nThis viva screens a candidate for \"{r.title}\""
                     + (f" at {r.company}" if r.company else "") + (f"; the role needs {', '.join(r.focus)}" if r.focus else "")
                     + ". In recruiter_summary, say which of those skills the evidence shows and which it doesn't, citing "
                     "topics and test results. Judge only the code and answers: nothing about the person beyond that, "
                     "and not grammar, accent or fluency."
                     + (f" Fill skill_evidence with one entry for each of: {r.focus}." if r.focus else ""))
    if state.previous:
        lines.append("\n## This was a retake")
        lines.append("Same topics, new questions. Scores on these topics in the previous attempt: "
                     + ", ".join(f"{t.topic} {state.previous.topics.get(t.topic)}" for t in topics)
                     + ". Say in the headline whether the student improved, citing a topic.")
    return "\n".join(lines)


def _llm_narrative(summary: ProjectSummary, state: PanelState, topics: list[TopicScore]) -> ReportNarrative:
    system = (PROMPTS / "scorer.md").read_text() + "\n\n## Project\n" + render_summary(summary, code=False)
    user = _render_for_scorer(state, topics) + (
        f"\n\nTopic names to use in topic_notes: {[t.topic for t in topics]}\nWrite the report narrative."
    )
    return llm.structured_call(system, user, ReportNarrative, effort="medium")


# Offline only (no model): rough skill -> code words, so the demo can show per-skill scores.
SKILL_WORDS = {
    "database": {"db", "sql", "sqlite", "database", "query", "connection", "models", "orm"},
    "security": {"auth", "password", "token", "hash", "jwt", "secret", "injection", "login"},
    "test": {"test", "tests", "pytest", "fines"},
    "api": {"api", "route", "routes", "endpoint", "books", "loans", "rest"},
    "concurren": {"borrow", "lock", "thread", "async", "race"},
}


def _offline_skill_match(skill: str, topic: TopicScore) -> bool:
    words = set((topic.topic + " " + (topic.file_ref or "")).lower().replace("/", " ").replace("_", " ")
                .replace(".", " ").replace(":", " ").split())
    s = skill.lower()
    related = set(s.split()) | set().union(*(v for k, v in SKILL_WORDS.items() if k in s))
    return bool(words & related)


def _offline_narrative(summary: ProjectSummary, state: PanelState, topics: list[TopicScore]) -> ReportNarrative:
    from .schemas import _NarrativeSkill, _NarrativeStudyStep, _NarrativeTopicNote, _NarrativeWeakSpot

    reached = sorted((t for t in topics if t.confidence is not None), key=lambda t: t.confidence)
    weak = [t for t in reached if t.confidence < 60][:4]
    turn_of = {}
    for i, t in enumerate(state.transcript, 1):
        turn_of.setdefault(t.topic, []).append(i)
    return ReportNarrative(
        headline=f"Scored {round(sum(t.confidence for t in reached) / max(len(reached), 1))}/100 across "
                 f"{len(reached)} topics; weakest on {weak[0].topic if weak else 'nothing major'}.",
        topic_notes=[_NarrativeTopicNote(topic=t.topic, note=f"Verdicts: {', '.join(t.verdicts) or 'none'}.") for t in topics],
        weak_spots=[_NarrativeWeakSpot(title=t.topic, file_ref=t.file_ref or "", why="Answers stayed generic or missing "
                    "when asked about the actual code.", turns=turn_of.get(t.topic, [])[:2]) for t in weak],
        study_plan=[_NarrativeStudyStep(title=f"Revisit {t.topic}", action=f"Re-read {t.file_ref} and explain it aloud "
                    "line by line, then answer the panel's questions on it again.", file_ref=t.file_ref or "",
                    minutes=30) for t in weak] or [_NarrativeStudyStep(title="Rehearse", action="Run another viva.",
                                                                         file_ref="", minutes=20)],
        skill_evidence=[_NarrativeSkill(skill=s, topics=[t.topic for t in topics if _offline_skill_match(s, t)])
                        for s in (state.role.focus if state.role else [])],
        recruiter_summary=f"Answered {sum(1 for t in state.transcript if t.answer)} questions; "
                          f"{sum(1 for t in reached if t.confidence >= 60)} of {len(reached)} topics at 60+ confidence. "
                          f"{len(state.verifications)} claim(s) checked against the test suite.",
        interview_tips=_offline_tips(state, reached, weak),
    )


def _offline_tips(state: PanelState, reached: list[TopicScore], weak: list[TopicScore]) -> list[str]:
    tips = []
    if weak:
        tips.append(f"Before your next interview, re-read {weak[0].file_ref or 'the weak topic above'} until you can "
                    "explain it out loud without looking at the code.")
    if any(t.confidence is not None and 40 <= t.confidence < 60 for t in reached):
        tips.append("For a partial answer, say what you're sure of first, then what you're unsure of — that reads "
                    "as more honest than guessing the whole thing.")
    if sum(1 for t in state.transcript if t.answer in (None, "")) or any(
            t.verdict == "no_answer" for t in state.transcript):
        tips.append("Saying 'I don't know, but here's my best guess and why' beats silence — interviewers mark "
                    "reasoning, not just the final answer.")
    tips.append("Practice explaining one feature end-to-end out loud before the interview: what it does, why you "
                "built it that way, and what you'd improve.")
    return tips[:5]


# ---------- rendering ----------

READINESS_LABEL = {"ready": "Ready", "almost_ready": "Almost ready", "needs_work": "Needs work", "not_ready": "Not ready"}


def report_to_markdown(r: Report) -> str:
    out = [
        f"# Viva report — {r.project}",
        f"**{r.overall_score}/100 · {READINESS_LABEL[r.readiness]}** · {r.questions_asked} questions · {r.repo_url}",
        f"\n> {r.headline}\n",
        "## Topics",
        "| Topic | Examiner | Confidence | Verdicts | Note |",
        "|---|---|---|---|---|",
    ]
    for t in r.topics:
        conf = "—" if t.confidence is None else str(t.confidence)
        out.append(f"| {t.topic} | {DISPLAY[t.examiner]} | {conf} | {', '.join(t.verdicts) or '—'} | {t.note} |")
    out.append("\n## Weak spots")
    for w in r.weak_spots:
        out.append(f"### {w.title}" + (f" — `{w.file_ref}`" if w.file_ref else ""))
        out.append(w.why)
        for q in w.evidence:
            out.append(f"> **Q{q.turn} {q.speaker}:** {q.text}")
        out.append("")
    if r.baseline_tests:
        b = r.baseline_tests
        out.append(f"\n## Baseline (sandbox, run before any question was asked)\n**{b.status}** — {b.passed} passed, "
                   f"{b.failed} failed ({b.duration_s}s)" + (f" — failing: {', '.join(b.failing_tests)}" if b.failing_tests else ""))
    out.append("\n## Test evidence (sandbox)")
    if not r.test_evidence:
        out.append("No claims were checked against the tests in this session.")
    for v in r.test_evidence:
        res = v.result
        out.append(f"- **Claim (A{v.turn}):** {v.claim}\n  - Ran `{res.command}` → **{res.status}**, "
                   f"{res.passed} passed / {res.failed} failed"
                   + (f" ({', '.join(res.failing_tests)})" if res.failing_tests else "")
                   + f"\n  - **{v.outcome.upper()}** — {v.explanation}")
    out.append("\n## Code checks by the Engineer")
    if not r.code_checks:
        out.append("None in this session.")
    for c in r.code_checks:
        args = ", ".join(f"{k}={v!r}" for k, v in c.args.items())
        out.append(f"- A{c.turn}: `{c.tool}({args})` → {c.summary}")
    out.append("\n## Unanswered questions")
    if not r.unanswered:
        out.append("None.")
    for u in r.unanswered:
        out.append(f"- Q{u.turn} ({DISPLAY[u.examiner]}, `{u.file_ref}`): {u.question}\n  - Student: _{u.answer}_")
    out.append("\n## Study plan")
    for i, s in enumerate(r.study_plan, 1):
        out.append(f"{i}. **{s.title}** ({s.minutes} min){' — `' + s.file_ref + '`' if s.file_ref else ''}: {s.action}")
    if r.interview_tips:
        out.append("\n## Tips for your next interview")
        for t in r.interview_tips:
            out.append(f"- {t}")
    out.append(f"\n## Summary for recruiters\n{r.recruiter_summary}")
    return "\n".join(out)
