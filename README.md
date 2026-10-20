# Viva Panel

A multi-agent AI examiner panel that grills students on their own GitHub project.
Three examiners — **Professor** (design/theory), **Industry Engineer** (scale, edge cases, security, runs tests in a sandbox) and **Curious Junior** (explain it simply) — question the student, judge answers against the real code, and produce a scored report with a study plan.

## Layout

| Folder | Owner | What |
|---|---|---|
| `agents/` | A — AI/agent lead | Examiner prompts, moderator, scoring agent, shared `schemas.py` |
| `backend/` | B — backend/tools lead | FastAPI API, GitHub ingestion, SQLite sessions and event log ([backend/README.md](backend/README.md)); Docker sandbox still to do |
| `frontend/` | C — frontend/voice lead | Landing, live panel, report; demo mode replays a recorded session ([frontend/README.md](frontend/README.md)) |
| `docs/` | everyone | [`architecture.md`](docs/architecture.md) — how the agents coordinate · [`jury-qa.md`](docs/jury-qa.md) — jury prep · [`api-contract.md`](docs/api-contract.md) — endpoints, event format, tool names · [`agents-interface.md`](docs/agents-interface.md) — how the backend drives the panel |

## Run the whole thing

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                                     # add GROQ_API_KEY (or ANTHROPIC_API_KEY), optionally GEMINI_API_KEY as backup
.venv/bin/uvicorn backend.app.main:app --port 8000       # API, see backend/README.md
cd frontend && npm install && VITE_API_URL=http://127.0.0.1:8000 npm run dev   # UI on :5190
```

Without `VITE_API_URL` the UI runs in demo mode (replays a recorded session). With `VIVA_OFFLINE=1` the API runs
scripted agents with no model calls.

## Quick start (agents only)

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env        # add ANTHROPIC_API_KEY, or set VIVA_PROVIDER=groq + GROQ_API_KEY
.venv/bin/python -m agents.cli                     # full panel vs. the mock project
.venv/bin/python -m agents.cli --only professor     # one examiner
VIVA_OFFLINE=1 .venv/bin/python -m agents.cli      # scripted, no API calls
```

Each run is logged to `runs/*.jsonl` in the shared Event format. `VIVA_DEBUG=1` prints latency and tokens per model call.

**Groq free tier note:** 8,000 tokens/minute per model. A full session sends about 53k input tokens over 30 calls (measured; see docs/evidence/token-optimisation.md), so the Junior and the cross-challenge checks run on `gpt-oss-20b` (its own budget) and the Professor/Engineer on `gpt-oss-120b`. Expect occasional 10–30 s waits on the free tier.

**Gemini backup:** add `GEMINI_API_KEY` (Google AI Studio) to `.env` and any call that hits a Groq limit moves to Gemini (flash, then flash-lite) instead of failing. A model that hits its daily cap is skipped for the rest of the day. Tested live: the edge-case eval passed 7/7 with the session switching from Groq to Gemini halfway through.

**Deploy:** one Docker container serves the app and the API at one URL; Render blueprint included. See [docs/deploy.md](docs/deploy.md).

## Evals

```bash
.venv/bin/python -m agents.eval edge    # scripted edge-case student, checks verdicts (7 cases)
.venv/bin/python -m agents.eval mixed   # vague-then-specific student, full report
.venv/bin/python -m agents.eval large   # 3,000-file repo, prompt-size check
.venv/bin/python -m agents.quality runs/*.json   # question-quality metrics for any saved run
```

Latest results: [docs/evidence/day4-eval.md](docs/evidence/day4-eval.md).

## How the agents coordinate

1. **Moderator** reads the project summary and assigns 2–3 non-overlapping topics to each examiner, each anchored to a real file.
2. The examiner holding the floor opens a topic. After each answer it **judges it against the code** (strong / partial / weak / no answer) and either **follows up** (max 2 per topic) or yields.
3. When an examiner yields, a colleague may **cross-challenge**: disagree with the verdict or push the point into their own lane (max 2 per session).
4. Otherwise the moderator hands the floor to the next examiner (round-robin) until topics or the 12-question budget run out.
5. All examiners share one transcript, so they can catch the student contradicting an earlier answer.
6. The **Engineer is a tool-using agent**: while judging, it can call `read_file` and `search_code` on the student's repo in a function-calling loop (e.g. the student says "I close connections in teardown", the Engineer searches, finds nothing, and calls it out). See [docs/evidence/agentic-engineer.md](docs/evidence/agentic-engineer.md).
7. When an answer makes a **testable claim** ("my tests cover double-borrowing"), the Engineer decides which tests to run (`run_tests`), can read the test file to see what it really exercises, and judges the result against the claim: supported, contradicted, or inconclusive (tests pass but don't exercise the claim).
8. The **scoring agent** builds the report. Code computes every score from the verdicts and copies quotes from the transcript; the model writes weak spots, the study plan and the recruiter summary, and every turn or file it cites is validated.
