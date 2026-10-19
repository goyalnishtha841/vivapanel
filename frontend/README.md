# Viva Panel — frontend

React 18 + Vite + Tailwind + framer-motion. Three screens, hash-routed:

| Route | Screen |
|---|---|
| `#/` | Landing: repo-link input, live demo of a recorded session, the panel, how it works, FAQ |
| `#/session/<id>` | Live panel: examiner cards (speaker highlighted), transcript with verdicts and tool activity, answer box (text + mic), "why this question" sidebar, moderator's plan, activity log |
| `#/report/<id>` | Report: score ring, confidence by topic, weak spots with transcript quotes, test evidence, unanswered questions, study plan checklist, recruiter summary, save as PDF |

## Run

```bash
cd frontend
npm install
npm run dev            # http://localhost:5190
```

### Demo mode vs live mode

- **Demo (default)**: no backend needed. It replays a real recorded Groq session
  (`src/mock/session.json`, `src/mock/report.json`, copied from `docs/evidence/`) and pauses at each question
  for your answer. A banner says so; your answers are shown but not graded.
- **Live**: point it at the FastAPI backend and it uses the contract in `docs/api-contract.md`
  (`POST /session`, SSE `GET /stream/{id}`, `POST /answer`, `GET /report/{id}`):

```bash
VITE_API_URL=http://localhost:8000 npm run dev
```

The backend must allow CORS from the frontend origin, and must echo each answer on the stream as a `student`
event (the panel already does this).

## Where things are

| Path | What |
|---|---|
| `src/lib/api.js` | Live and demo adapters, same interface |
| `src/lib/events.js` | Turns the event stream into transcript items; extracts verdicts, challenges, test outcomes, the plan |
| `src/lib/examiners.js` | Name, lane, colour and voice for each examiner |
| `src/lib/speech.js` | Web Speech API: a different voice per examiner, dictation for answers |
| `src/views/` | Landing, Session, Report |
| `src/components/` | Nav, logo, avatars, code-minimap background, hero demo, repo input |

Design: dark by default with a light theme for projectors (toggle in the nav). Each examiner has one colour used
everywhere: Professor amber, Engineer teal, Junior pink. Brand violet.
