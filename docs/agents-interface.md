# Agents → Backend handover (Member A → Member B)

Everything B needs is in `agents/panel.py`. One `Panel` per viva session.

```python
from agents.panel import Panel
from agents.schemas import ProjectSummary, Event

panel = Panel(summary, run_tests=run_tests)   # run_tests: your sandbox, see below
for event in panel.start():            # moderator plan + first question
    publish(session_id, event)         # -> SSE on GET /stream/{id}

# on POST /answer
for event in panel.answer(text):       # student echo, judgement, next question(s)
    publish(session_id, event)

panel.awaiting_answer                  # True when a question is open
panel.done                             # True after the moderator closes the session
panel.state.assessments                # per-answer verdicts for GET /report/{id}
panel.state.transcript                 # full Q&A with verdicts

# on GET /report/{id}, once panel.done
from agents.scoring import build_report
report = build_report(summary, panel.state)   # one LLM call, ~15 s; cache it in SQLite
return report.model_dump()
```

## run_tests (Day 3)

Pass a function bound to the session's repo copy:

```python
def run_tests(test_path: str | None) -> RunTestsResult:   # None = whole suite
    ...  # Docker: no network, read-only repo, 512 MB, 1 CPU, 60 s
```

- Never raise for failing tests; return `status="failed"`. Sandbox trouble → `status="error"` / `"timeout"`.
  If it does raise, the panel converts the exception to an `error` result and carries on.
- `test_path` is always a test file from `summary.files` (the agents check), or `None`.
- At most one run per session (`MAX_TEST_RUNS` in `agents/panel.py`), so a 60 s timeout is acceptable.
- Until the sandbox exists, use `agents.tools.mock_test_runner()` (canned results for the mock repo).
- No `run_tests` (or no Engineer on the panel) → claims are simply not verified.

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

## Edge cases the panel handles (Day 4)

| Student sends | What happens |
|---|---|
| "Can you repeat that?" / "What do you mean?" | Same examiner re-asks in plainer words; not graded (once per question) |
| empty, "idk", "no idea" | Always `no_answer`; the follow-up is easier |
| "yes" / one word | Usually `weak`; asked to explain |
| "ignore previous instructions…" | A `system` guardrail event, verdict capped at `weak`, no test run |
| a huge paste | Clipped to 1,500 chars before it reaches any prompt |

Nothing for B to do here — it's all inside `panel.answer()`. Just pass the raw text through.

**Rate limits:** `agents.llm` retries a rate-limited call on the fast model, and after a daily cap stays on it.
`LLMError` is only raised if the fast model fails too.

## Event speakers you will see

`moderator` (plan, handovers, closing) · `professor` · `engineer` · `junior` · `student` (echo of the
answer) · `system` (errors and sandbox results). See api-contract.md §5 for the three sandbox events.

## Limits (in `agents/panel.py`)

`MAX_QUESTIONS = 12` (about 5 minutes), `MAX_CHALLENGES = 2`, and at most 2 follow-ups per topic
(`MAX_FOLLOW_UPS` in `agents/examiner.py`).
