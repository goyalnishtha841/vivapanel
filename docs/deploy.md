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
| `PORT` | 8000 | Set by the host |

## Safety

The deployed app clones and reads student repos but **never executes their code**: real repos get no test runner
until the Docker sandbox (no network, read-only, memory/CPU/time limits) is ready. Only the built-in sample project
runs its recorded test results.
