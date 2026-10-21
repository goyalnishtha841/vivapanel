# Test case proof — Viva Panel

The brief asks for one labelled run per official test case, with the input, the expected result, the actual
result and the evidence, and asks us to explain differences instead of presenting them as success. There is one
official test case (the participant-defined demonstration), so there is one labelled run below, plus the
real-repo runs that back it up.

---

## Run 1 — the official demonstration

**Official test case:** "The user pastes a GitHub repo link and the three examiners join a live panel session
(text and voice). The student answers questions while the on-screen view shows which examiner is speaking and why.
Examiners challenge weak answers and each other, and the Engineer agent verifies one of the student's claims by
running the repo's tests in the sandbox. After about 5 minutes, the student gets a scored report with weak spots,
evidence from the transcript and test results, and a study plan."

| | |
|---|---|
| **Input** | Repo: the sample project `campus-library-api` (`agents/mock_data/campus-library-api/`, served as `https://github.com/example-student/campus-library-api`). Student answers: a fixed script that mixes a vague answer, a strong answer, a testable claim and several non-answers, so every branch is exercised. |
| **Models** | Groq `openai/gpt-oss-120b` (Professor, Engineer, moderator, scoring), `openai/gpt-oss-20b` (Junior, cross-challenge checks) |
| **Date** | 20 Oct 2026 |
| **Evidence** | Full event log: [`evidence/2026-10-20-groq-live-panel-with-sandbox.json`](evidence/2026-10-20-groq-live-panel-with-sandbox.json) · Report: [`evidence/2026-10-20-groq-live-report.md`](evidence/2026-10-20-groq-live-report.md) and [`.json`](evidence/2026-10-20-groq-live-report.json) |

### Expected vs actual, step by step

| # | Expected | Actual (event numbers refer to the log) | Result |
|---|---|---|---|
| 1 | Repo is read and topics are split between three examiners with no overlap | Event 1: moderator assigns password hashing + borrow concurrency to the Professor, SQLite scalability + SQL injection to the Engineer, JWT flow + borrow lifecycle to the Junior | ✅ Pass |
| 2 | Every question names a real file or function | All 12 questions cite a file (`app/auth.py:hash_password`, `app/db.py`, `app/routes/loans.py:borrow_book`, …); 0 invalid references (checked by `agents/quality.py`) | ✅ Pass |
| 3 | The screen shows who is speaking and why | Every examiner event carries `speaker`, `reasoning` ("why this question") and `file_ref`; the UI highlights the speaker and shows the reasoning | ✅ Pass |
| 4 | A weak answer is challenged | Event 3: "It's secure because we hash passwords and use JWT." → event 4: judged **weak**, the Professor asks a sharper follow-up about the missing salt | ✅ Pass |
| 5 | Examiners challenge each other | Events 11 and 15: the Professor extends the Engineer's verdict ("I'd add a point, Engineer…"), then the Junior extends the Professor's. 2 cross-challenges in the session | ✅ Pass |
| 6 | The Engineer verifies a claim by running the repo's tests | Event 21: student claims "my tests cover double-borrowing". Event 22: the Engineer calls `run_tests` on `tests/test_loans.py`. Event 23: "passed — 2 passed, 0 failed". Event 24: the Engineer reads the test, sees it only sends two requests one after the other, and rules the claim **inconclusive**: passing tests don't prove the code is safe under concurrent requests | ✅ Pass (see difference A) |
| 7 | A scored report with weak spots, transcript evidence, test results and a study plan | Report: 26/100 "Not ready", 6 topics with confidence scores, weak spots quoting the student's own words with file references, the test run listed under evidence, and a study plan | ✅ Pass |
| 8 | About 5 minutes | 12 questions + report. About 2.5 minutes on the deployed site in a separate full run | ✅ Pass |
| 9 | Text **and voice** | This logged run used text. Voice (speech-to-text answers, a different voice per examiner, hands-free mode) is in the UI through the browser's Web Speech API | ⚠️ See difference B |

### Differences from the expected result (explained, not hidden)

**A. The sample project's test run uses recorded results.** For the sample project only, `run_tests` returns
recorded pytest output (`agents/mock_data/mock_test_results.json`) so the demo is fast and needs no sandbox.
The Engineer's decisions (which file to test, reading the test afterwards, the verdict) are live model calls.
For **real repos**, the same tool runs the student's own pytest suite in an isolated sandbox: Docker locally
(no network during tests, 768 MB memory, 1 CPU, 60 s per run), or an E2B microVM on hosts without Docker.
Verified locally on `pallets/markupsafe`: 12 passed, claim marked supported, network blocked during tests.
The hosted sandbox status is shown live at `GET /health` → `sandbox`.

**B. Voice isn't captured in a JSON log.** It runs in the browser, so it's shown in the demo video rather
than in this file.

**C. The student's answers were scripted.** This makes the run repeatable. Several are deliberate non-answers
("I already explained that part…") to test that the panel handles them, which is why the score is low.

---

## Real-repo runs (live site, 21–22 Oct 2026)

The same flow on real public repos, through the deployed URL. Record every run, including the ones that fail.

One command does all five runs and the hiring-mode run, saves each as `docs/evidence/live-<date>-<repo>.json`, and
prints this table filled in:

```bash
python scripts/live_check.py                        # default repos: markupsafe, itsdangerous, microblog, slugify, vivapanel
python scripts/live_check.py --repos <url> <url> …  # or your own repos
```

Set `DAYTONA_API_KEY` on Render first, or the Sandbox column says "not triggered" for every real repo.

| # | Repo | Panel | Questions cite real files? | Sandbox | Report | Time |
|---|---|---|---|---|---|---|
| 1 | SpectaclesGuy/scrapeflow (Python) | 12 questions | 12/12 cite a file | Engineer chose `tests/test_app.py`; run failed (Daytona: no default region) | ✅ 18/100 | 358 s |
| 2 | goyalnishtha841/vivapanel (Python) | 12 questions | 12/12 cite a file | Engineer chose `tests/test_api.py`; run failed (same) | ✅ 16/100 | 534 s |
| 3 | goyalnishtha841/gazelens (Python + JS) | 12 questions | 12/12 cite a file | Engineer chose `backend/gaze_estimation/test_gaze_estimation.py`; run failed (same) | ✅ 15/100 | 722 s |
| 4 | goyalnishtha841/foresight (Python + JS) | 11 questions | 11/11 cite a file | Engineer chose `backend/tests/test_forecast.py`; run failed (same) | ✅ 20/100 | 562 s |
| 5 | goyalnishtha841/tradepilot | — | — | — | pending (the visitor's daily viva limit was reached) | — |

**Result: 4 of 4 runs so far ran end to end** (the 5th is pending). Scores are low because the live-check script
answers every question with the same fixed, vague answers; it tests the pipeline, not a student.

What the runs show:
- Every question named a real file and function of that repo (e.g. *"Why does `detect_seasonal_period` default
  to a period of 4 when the series length is below 14?"* on foresight).
- The Engineer explored each repo with tools (read files, searched for symbols) and picked a real test file to
  check a claim. All four test runs failed at sandbox creation with *"This organization does not have a default
  region"*: a Daytona account setting (Dashboard → set a default region), not a code fault. `/health` shows the
  same error under `sandbox.last_error`.
- No cross-challenges: they follow only strong or partial verdicts, and the scripted answers never earned one.
- When an answer dodges the question, follow-ups can circle the same point (three hashing questions in a row in
  the hiring run).

**Hiring mode, live** (`live-2026-10-22-hiring.json`, scrapeflow, role "Backend developer intern"): 12 questions,
recruiter report generated (score 16; skills: backend 18, REST APIs 10, testing not tested), and the candidate's
own session link was refused the recruiter report (403). Copy this number into the README ("Real GitHub repos") and
`docs/jury-qa.md` ("Tested on many repos?").

---

## Supporting evidence already in the repo

| What | Result | File |
|---|---|---|
| Edge cases, live | 7 / 7 handled: "repeat?", "idk", one word, empty, prompt injection, off-topic, pasted code | [`evidence/day4-eval.md`](evidence/day4-eval.md) |
| Tool-using Engineer | Searched the repo and caught a false claim that a teardown hook closes connections | [`evidence/agentic-engineer.md`](evidence/agentic-engineer.md) |
| Provider failover, live | Groq hit its limit mid-session; Gemini took over without the session stopping | [`evidence/live-edge-eval-gemini-fallback.json`](evidence/live-edge-eval-gemini-fallback.json) |
| Automated tests | 131 tests (unit, panel rules, sandbox, API, hiring, team mode) on every push | `tests/`, `.github/workflows/ci.yml` |
