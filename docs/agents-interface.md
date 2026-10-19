# Agents → Backend handover (Member A → Member B)

Everything B needs is in `agents/panel.py`. One `Panel` per viva session.

```python
from agents.panel import Panel
from agents.schemas import ProjectSummary, Event

panel = Panel(summary)                 # summary: ProjectSummary from your repo reader
for event in panel.start():            # moderator plan + first question
    publish(session_id, event)         # -> SSE on GET /stream/{id}

# on POST /answer
for event in panel.answer(text):       # student echo, judgement, next question(s)
    publish(session_id, event)

panel.awaiting_answer                  # True when a question is open
panel.done                             # True after the moderator closes the session
panel.state.assessments                # per-answer verdicts for GET /report/{id}
panel.state.transcript                 # full Q&A with verdicts
```

## Things to know

- **Generators.** `start()` and `answer()` yield each `Event` as soon as it's ready. Each yield may be
  preceded by an LLM call (1–4 s), so publish as you go rather than calling `list()` on them.
- **Blocking calls.** The agents use the synchronous Anthropic client. In FastAPI, run the loop in a
  thread (`await run_in_threadpool(...)` or a background task) so you don't block the event loop.
- **Persistence.** `panel.to_json()` is the whole session state (~3 KB). Store it in the session row in
  SQLite after every `answer()`. Rebuild with `Panel.from_json(summary, saved)`.
- **Errors.** Any failed model call raises `agents.llm.LLMError`. Catch it, publish an
  `Event(speaker="system", message=...)`, and return `llm_failed` from the endpoint. The panel state is
  unchanged by a failed call before the question is appended, so the student can retry the answer.
- **Calling `answer()` with no open question** yields a single `system` event and changes nothing.
- **Offline mode.** With `VIVA_OFFLINE=1` (or no API key) every agent is scripted: no network, no cost,
  same Event shapes. Use it for integration tests and for Member C's UI work.
- **Single examiner.** `Panel(summary, examiners=("professor",))` runs one examiner only.

## Event speakers you will see

`moderator` (plan, handovers, closing) · `professor` · `engineer` · `junior` · `student` (echo of the
answer) · `system` (errors). `tool_used` is always `null` until `run_tests` lands on Day 3.

## Limits (in `agents/panel.py`)

`MAX_QUESTIONS = 12` (about 5 minutes), `MAX_CHALLENGES = 2`, and at most 2 follow-ups per topic
(`MAX_FOLLOW_UPS` in `agents/examiner.py`).
