# Viva Panel — backend

FastAPI app that wraps the agents (`agents/panel.py`) behind the API in `docs/api-contract.md`.

```bash
# from the repo root
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn backend.app.main:app --port 8000           # live (needs GROQ_API_KEY or ANTHROPIC_API_KEY in .env)
VIVA_OFFLINE=1 .venv/bin/uvicorn backend.app.main:app --port 8000   # scripted agents, no API calls
```

Then run the frontend against it: `cd frontend && VITE_API_URL=http://127.0.0.1:8000 npm run dev`.

## Flow

| Step | Where |
|---|---|
| `POST /session` validates the GitHub URL, creates the session, returns at once | `app/main.py` |
| Background thread: check repo via GitHub API, shallow clone, pick key files, one LLM call writes the `ProjectSummary` (snippets cut from the real files by code), moderator plans, first question | `app/ingest.py`, `app/runner.py` |
| `POST /answer` → background thread runs `panel.answer()`; 409 `panel_busy` if a turn is in progress | `app/runner.py` |
| When the viva ends, the scoring agent writes the report; `GET /report/{id}` returns 202 until it's ready | `app/runner.py` |
| Every event goes to SQLite; `GET /stream/{id}` replays and tails them as SSE (event id = sequence number, so reconnects resume) | `app/store.py`, `app/main.py` |

The landing page's sample project (`github.com/example-student/campus-library-api`) isn't a real repo: the backend
serves the bundled mock project, with `read_file`/`search_code` on its files and the mock test runner.

## Errors

`invalid_url` (400), `session_not_found` (404), `private_repo`, `repo_too_large`, `empty_repo`, `no_code`,
`llm_failed` (as a `system` event on the stream, session status `error`), `panel_busy` (409), `viva_not_finished` (409).
If a model call fails mid-viva, the stream gets a `system` event with `reasoning: "retry_answer"`: the question stays
open and the student sends the answer again. Raw provider errors only go to the server log.

## Not done yet

- **Sandbox**: real repos run without `run_tests` until the Docker sandbox exists (roadmap step 3). The Engineer can
  still read and search the clone.
- **Settings**: `VIVA_DATA_DIR`, `VIVA_CORS_ORIGINS`, `VIVA_MAX_REPO_KB`, `VIVA_CLONE_TIMEOUT_S`, `GITHUB_TOKEN`
  (raises GitHub's 60 requests/hour limit).
