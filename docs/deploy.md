# Deploying Viva Panel

One Docker container serves both the app and the API, at one URL. The image builds the React frontend in live
mode (`VITE_API_URL=/`), and FastAPI serves it next to the API routes. That means no CORS setup and no second host.

## Render (free)

1. Push this repo to GitHub.
2. On render.com, choose **New → Blueprint** and pick the repo. `render.yaml` creates a free Docker web service.
3. When asked, fill in `GROQ_API_KEY` and `GEMINI_API_KEY` (the backup). `GITHUB_TOKEN` is optional: it raises
   GitHub's limit for repo checks from 60 to 5,000 an hour.
4. Wait for the first build (~5 min). `/health` should then show `{"status":"ok","llm":"groq:…"}`.

Free-plan behaviour to know before a demo:
- It **sleeps after 15 minutes idle**, and the first request after that takes about a minute. Open the URL a couple
  of minutes before presenting.
- The disk is temporary, so sessions and reports are lost when the service restarts or redeploys. That's fine for
  a demo; a paid disk or Postgres fixes it.

## Run the same container locally

```bash
docker build -t viva-panel .
docker run -p 8000:8000 --env-file .env viva-panel     # open http://localhost:8000
```

## Settings

| Variable | Default | What |
|---|---|---|
| `VIVA_DAILY_SESSIONS` | 40 | New sessions allowed per rolling 24 h, so a public link can't burn the shared free-tier quota (0 = no cap) |
| `VIVA_PROVIDER` | groq (in render.yaml) | Primary LLM provider; Gemini is the automatic backup when `GEMINI_API_KEY` is set |
| `E2B_API_KEY` | — | Hosted test sandbox for real repos (needed on Render) |
| `VIVA_SANDBOX` | auto | `auto` · `docker` · `e2b` · `off` |
| `PORT` | 8000 | Set by the host |

## Safety

Student code never runs on the server. When the Engineer checks a claim, the repo's own pytest suite runs in a
throwaway sandbox (`backend/app/sandbox.py`): a copy of the repo, memory/CPU/process limits, internet only while
installing dependencies and cut before any test runs, a 60 s limit per run, none of our keys inside, removed after
the viva.

- **On Render:** set `DAYTONA_API_KEY` (daytona.io: free credits, no card) and the sandbox is a hosted Daytona
  sandbox. `E2B_API_KEY` works too but E2B asks for a card. Without either, real repos are read and searched but not
  test-run; the sample project still shows test verification.

  Getting a Daytona key: sign up at [app.daytona.io](https://app.daytona.io) → **Keys** → **Create key** (sandbox
  permissions) → copy it → Render → your service → **Environment** → add `DAYTONA_API_KEY` → save (Render redeploys).
  Then open `/health`: `"sandbox": {"backend": "daytona"}` means it's on.
- **On a VM or locally:** Docker is used automatically if it's running (`VIVA_SANDBOX=docker` to force it).

### Checking the sandbox after a deploy

Open `https://<your-app>/health`. The `sandbox` field says what is live, without digging through logs:

| `sandbox` shows | Meaning | Fix |
|---|---|---|
| `"backend": "daytona"` or `"e2b"` | Hosted sandbox is on | — |
| `"backend": "off"` + `"problem"` | No sandbox: real repos aren't test-run | Set `DAYTONA_API_KEY` in Render → Environment, then redeploy |
| `"last_error": "..."` | A sandbox started but failed to set up (the same text as the `sandbox prepare failed:` log line) | Read the message; it's usually a dependency that won't install, or an invalid key |

The setup step falls back to `virtualenv` when an image has no `python3-venv` (E2B's default image may not).

### Keeping report links alive (Postgres)

Render's free plan wipes the disk on every restart or redeploy, and SQLite lives on that disk, so old report
links stop working. To keep them:

1. Create a free database at [neon.tech](https://neon.tech) (or Supabase) and copy its connection string
   (`postgresql://…?sslmode=require`).
2. In Render → Environment, add `DATABASE_URL` with that string and redeploy.
3. Open `/health`: `"storage": "postgres"` means it's on. Tables are created automatically.

### Demo limits and cleanup

- `VIVA_DAILY_SESSIONS` (default 40) caps new vivas per rolling 24 h for everyone, and `VIVA_DAILY_PER_VISITOR`
  (default 6) per visitor, counted by a salted hash of their IP (the address itself isn't stored). Candidates
  opening an interview link are never blocked.
- Every 30 minutes a cleanup job deletes repo copies of vivas idle for `VIVA_CLEANUP_AFTER_H` hours (default 3) and
  closes their sandboxes. Finished vivas already clean up straight away. Transcripts and reports are kept.
