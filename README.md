# Viva Panel

A multi-agent AI examiner panel that grills students on their own GitHub project.
Three examiners — **Professor** (design/theory), **Industry Engineer** (scale, edge cases, security, runs tests in a sandbox) and **Curious Junior** (explain it simply) — question the student, judge answers against the real code, and produce a scored report with a study plan.

## Layout

| Folder | Owner | What |
|---|---|---|
| `agents/` | A — AI/agent lead | Examiner prompts, moderator, scoring agent, shared `schemas.py` |
| `backend/` | B — backend/tools lead | FastAPI, GitHub ingestion, tools, Docker sandbox, SQLite |
| `frontend/` | C — frontend/voice lead | Panel UI, live transcript, reasoning sidebar, voice, report page |
| `docs/` | everyone | [`api-contract.md`](docs/api-contract.md) — endpoints, event format, tool names |

## Quick start (agents)

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env        # add ANTHROPIC_API_KEY
.venv/bin/python -m agents.cli                 # Professor vs. the mock project
VIVA_OFFLINE=1 .venv/bin/python -m agents.cli  # scripted, no API calls
```

Each run is logged to `runs/*.jsonl` in the shared Event format.
