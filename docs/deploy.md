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

- **On Render:** set `E2B_API_KEY` (e2b.dev, free tier) and the sandbox is a hosted microVM. Without it, real repos
  are read and searched but not test-run; the sample project still shows test verification.
- **On a VM or locally:** Docker is used automatically if it's running (`VIVA_SANDBOX=docker` to force it).
