# Viva Panel

A multi-agent AI examiner panel that grills students on their own GitHub project.
Three examiners — **Professor** (design/theory), **Industry Engineer** (scale, edge cases, security, runs tests in a sandbox) and **Curious Junior** (explain it simply) — question the student, judge answers against the real code, and produce a scored report with a study plan.

## Layout

| Folder | Owner | What |
|---|---|---|
| `agents/` | A — AI/agent lead | Examiner prompts, moderator, scoring agent, shared `schemas.py` |
| `backend/` | B — backend/tools lead | FastAPI, GitHub ingestion, tools, Docker sandbox, SQLite |
| `frontend/` | C — frontend/voice lead | Panel UI, live transcript, reasoning sidebar, voice, report page |
| `docs/` | everyone | [`api-contract.md`](docs/api-contract.md) — endpoints, event format, tool names · [`agents-interface.md`](docs/agents-interface.md) — how the backend drives the panel |

## Quick start (agents)

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env        # add ANTHROPIC_API_KEY, or set VIVA_PROVIDER=groq + GROQ_API_KEY
.venv/bin/python -m agents.cli                     # full panel vs. the mock project
.venv/bin/python -m agents.cli --only professor     # one examiner
VIVA_OFFLINE=1 .venv/bin/python -m agents.cli      # scripted, no API calls
```

Each run is logged to `runs/*.jsonl` in the shared Event format. `VIVA_DEBUG=1` prints latency and tokens per model call.

**Groq free tier note:** 8,000 tokens/minute per model. A panel turn sends ~2–3k tokens, so the Junior and the cross-challenge checks run on `gpt-oss-20b` (its own budget) and the Professor/Engineer on `gpt-oss-120b`. Expect occasional 10–30 s waits on the free tier.

## How the agents coordinate

1. **Moderator** reads the project summary and assigns 2–3 non-overlapping topics to each examiner, each anchored to a real file.
2. The examiner holding the floor opens a topic. After each answer it **judges it against the code** (strong / partial / weak / no answer) and either **follows up** (max 2 per topic) or yields.
3. When an examiner yields, a colleague may **cross-challenge**: disagree with the verdict or push the point into their own lane (max 2 per session).
4. Otherwise the moderator hands the floor to the next examiner (round-robin) until topics or the 12-question budget run out.
5. All examiners share one transcript, so they can catch the student contradicting an earlier answer.
6. When an answer makes a **testable claim** ("my tests cover double-borrowing"), the Engineer runs the project's tests in the sandbox and judges the result against the claim: supported, contradicted, or inconclusive (tests pass but don't exercise the claim).
7. The **scoring agent** builds the report. Code computes every score from the verdicts and copies quotes from the transcript; the model writes weak spots, the study plan and the recruiter summary, and every turn or file it cites is validated.
