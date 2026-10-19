# Viva Panel — frontend

React 18 + Vite + Tailwind + framer-motion. Three screens, hash-routed:

| Route | Screen |
|---|---|
| `#/` | Landing: repo-link hero, replay of a recorded session, "Would your answer survive?" (real verdicts from the live agent, `src/mock/survive.json`), the panel, how it works, FAQ |
| `#/session/<id>` | The panel "on stage": three seated examiners (the one asking is lit), the current question large, feedback on your last answer, the Engineer's code checks live, a mic-first answer box, a 12-dot scorecard, and a transcript/plan drawer |
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
| `src/components/` | Nav, logo, avatars, ambient background (`Ambient.jsx`), red-pen marks (`RedPen.jsx`), hero demo, repo input |

## Design

"Red pen and ink": a viva is about being marked. Ink-black (dark) or warm exam paper (light, better on projectors).
The brand is the red pen; each examiner has one ink colour used everywhere: Professor fountain-pen blue, Engineer
teal, Junior highlighter yellow. Type is the same family as GazeLens: Outfit for everything, Instrument Serif
italic for one accented phrase at a time, Caveat for red-pen marks, JetBrains Mono only for file names and code.

No accounts: a student pastes a public repo link and starts. Each session and report has its own link.
