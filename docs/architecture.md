# Viva Panel — Architecture

How the agents coordinate, what the model decides versus what code guarantees, and why.

## 1. The big picture

```mermaid
flowchart LR
    S([Student]) -->|GitHub URL| API[FastAPI backend]
    API --> RR[Reader agent<br/>explores the repo<br/>🔧 read_file · search_code]
    RR -->|ProjectSummary| MOD[Moderator agent<br/>plans topics]
    MOD --> PANEL

    subgraph PANEL [Panel session · shared transcript]
        direction TB
        P[Professor<br/>design & theory]
        E[Engineer<br/>scale, edge cases, security<br/>🔧 tool-using agent]
        J[Junior<br/>explain it simply]
    end

    E <-->|read_file · search_code| REPO[(Read-only clone)]
    E <-->|run_tests| BOX[[Sandbox: Docker, Daytona or E2B<br/>no network · 768 MB · 1 CPU · 60 s]]
    PANEL -->|Events over SSE| UI[React UI<br/>speaker, reasoning, tool activity, voice]
    S <-->|answers: text / voice| UI
    PANEL -->|evidence| SC[Scoring agent]
    SC -->|Report| UI
```

| Agent | Decides (LLM) | File |
|---|---|---|
| **Reader agent** | Which files matter: reads the README, tree and rule-ranked candidates, opens or searches a few files, then picks the key files and writes the project summary. Code checks every path and function and cuts snippets from the real files | `backend/app/ingest.py:explore` |
| **Moderator** | Which 2 topics each examiner probes, anchored to real files, with no overlap | `agents/moderator.py` |
| **Professor** | Design-justification questions; verdict on each answer; follow up or move on | `agents/examiner.py` |
| **Engineer** | Same, for scale/edge cases/security, **plus which tools to call**: reads and searches code, picks which tests to run, judges the result | `agents/examiner.py` |
| **Junior** | Plain-language "explain it to me" questions that expose shallow understanding | `agents/examiner.py` |
| **Scoring agent** | Weak spots, per-topic notes, study plan, recruiter summary | `agents/scoring.py` |

## 2. One answer, step by step

What happens between the student pressing Enter and the next question (`agents/panel.py:Panel.answer`):

```mermaid
flowchart TD
    A[Student answer] --> C{Code: classify answer}
    C -->|"'can you repeat?'"| R[Same examiner rephrases<br/>not graded]
    C -->|empty / idk / one word /<br/>injection / long / normal| J[Asking examiner judges vs the code<br/>Engineer may call read_file / search_code]
    J --> EN[Code enforces edge-case rules<br/>e.g. 'idk' is always no_answer]
    EN --> T{Testable claim?}
    T -->|yes, budget left| V[Engineer agent verifies:<br/>run_tests, read the test file, judge]
    V --> Q1[Engineer asks about the result]
    T -->|no| F{Follow up?}
    F -->|yes, under 2 on this topic| Q2[Same examiner asks a deeper question]
    F -->|no| X{Colleague challenges?<br/>max 1 per topic, 2 per session}
    X -->|disagree / extend| Q3[Colleague asks, same topic and file]
    X -->|no| M[Moderator hands over<br/>round-robin to next examiner with topics left]
    M --> Q4[Next examiner opens a topic]
    M -->|no topics or 12 questions| END[Session ends → report]
```

Every arrow that ends in a question is a streamed `Event` with `speaker`, `message`, `reasoning` (why this
question, shown in the sidebar) and `file_ref` (which file it is about). Tool calls stream as their own events.

## 3. What the model decides vs. what code guarantees

The design rule: **the model makes the judgement calls; code makes the guarantees.** The guarantees are the
things a jury, a student or a recruiter needs to trust.

| The model decides | Code guarantees |
|---|---|
| What to probe, and why | Every cited file exists; a cited function exists in that file (one rewrite, then dropped) |
| Each question's wording | Under 45 words, one question, not a repeat of an earlier one (one rewrite) |
| The verdict on each answer | Empty or "I don't know" is always `no_answer`; an attempt to instruct the panel is never above `weak` |
| Whether to follow up, challenge or move on | At most 2 follow-ups per topic, 1 challenge per topic, 2 per session, 12 questions in total |
| Which tools the Engineer calls, and what the results mean | Tests always run for a flagged claim; an all-green run can't "contradict" a claim; tests run at most once |
| Weak spots, study plan, recruiter summary | Every score is computed from verdicts; every quote is copied from the transcript; cited turns and files are validated |
| — | Turn-taking (round-robin), so the live demo is fast, free and predictable |

## 4. The Engineer's tool loop

`agents/llm.py:agent_loop` is a standard function-calling loop that works on Groq, Gemini and Claude:

```mermaid
sequenceDiagram
    participant P as Panel
    participant E as Engineer (LLM)
    participant T as Tools
    P->>E: transcript + "judge Q7 against the actual code"
    E->>T: search_code("teardown")
    T-->>E: 0 matches
    P-->>P: stream "Let me search the code…" + result
    E->>T: read_file("app/main.py")
    T-->>E: 17 lines, no cleanup
    E->>P: submit(verdict=weak, judgement="no teardown exists, get_connection never closes…")
```

- Up to 3 tool calls per decision (`VIVA_AGENT_TOOL_CALLS`); after that, `submit` is the only tool offered.
- `submit`'s arguments are validated against a Pydantic schema; invalid ones go back to the model as a tool error.
- If the loop fails (malformed tool calls, provider errors), the Engineer judges without tools, and the viva carries on.
- `read_file` and `search_code` refuse any path outside the repository.

## 5. Shared memory

Examiners have no private state. Every call receives the **panel transcript**: all questions, all answers, and every
examiner's verdict. That is how the Professor can say "Earlier you told the Engineer X, but…", and how a colleague can
challenge a verdict. The whole session state is one Pydantic object (`PanelState`, about 3 KB), saved to SQLite after
every answer, so any request can rebuild the panel.

## 5b. Retake (re-viva)

After the report, the student can retake only their weakest topics. The plan comes from code, not the model
(`Moderator.retake_plan`): up to 3 topics that scored below 60 last time, worst first, each kept with the same
examiner and file. If everything cleared 60, the two lowest are retaken anyway. The viva is capped at 3 questions per
topic, examiners are told it's a retake and shown last time's questions, and code rejects a repeat of any of them
(the same duplicate check used within a session). The report carries the previous scores, and the scoring agent is
asked to say whether the student improved. No new repo summary call is made: the retake reuses the project summary.

## 5c. Team-project mode

Most final-year projects are team projects, and the real viva question is "did you write this?". The student picks
which contributor they are (`GET /contributors`, GitHub's list), and ingestion clones with full history (commits and
trees only, no old file contents). `backend/app/authorship.py` matches the student to their commits (SHAs, emails and
names from one GitHub API call, plus their noreply address) and counts, per file, their commits against everyone's.
A file is theirs if they made at least half its commits. Their files rank first as key files, the project card tells
every examiner which files are theirs, and `Moderator._own_work_first` guarantees at least half the topics are on
them, whatever the model planned. The report marks each topic "your code" or "teammate's code". The `.git` folder
is deleted right after.

## 5d. Hiring mode

Same panel, different reader. `POST /invites` stores a role brief (title, company, skills) and returns a candidate
token plus a results key (stored only as a SHA-256 hash). A session started from the invite carries the role: the
moderator is told to prefer topics that show those skills, and the scorer writes the recruiter summary against them
and maps each skill to the topics that tested it. Code computes each skill's score as the mean of those topics'
confidence, dropping topics that don't exist. The browser reports per-answer timing and pastes, summarised as
"how answers were given". The report adds the full transcript and is served only via `GET /screening/{token}?key=`;
`GET /report/{id}` refuses screening sessions, and they can't be retaken. Every page says it's one signal for a
person to review, and the shared rules forbid grading grammar, accent or fluency.

## 6. Scoring

```
topic confidence = weighted mean of verdict scores × 100 − 15 if a test contradicted the student's claim
                   strong 1.0 · partial 0.55 · weak 0.2 · no_answer 0
                   later answers weigh more (recovering after a follow-up shows understanding)
overall score    = mean of the topics that were reached
readiness        = ≥ 80 ready · ≥ 60 almost ready · ≥ 40 needs work · below 40 not ready
```

One model call then writes the narrative. It may only point at transcript turn numbers and repo files; code
validates those and attaches the exact quotes. The model cannot invent evidence.

## 7. Safety

- **Student input is data, not instructions.** Answers are wrapped in « » and the prompts say so; a regex catches
  common injection phrasing, shows a visible guardrail event and caps the verdict.
- **Repo content is data too.** The summary is labelled as material to examine, not instructions.
- **Sandbox** (`backend/app/sandbox.py`): the student's pytest suite runs in a throwaway Docker container, Daytona sandbox or E2B
  microVM, never on the server. A copy of the repo; 768 MB, 1 CPU, 256 processes, no Linux capabilities; internet only
  while installing dependencies, cut before any test runs; 60 s per run; none of our keys inside; removed after the
  viva. It's prepared in the background as soon as the repo is read, so the first test run doesn't wait for pip.
  Only real test files can be targeted; anything else runs the whole suite.
- **Secrets** live only in `.env`, which is git-ignored.

## 8. Models and cost

| | Groq (primary) | Gemini (backup) | Claude (supported) |
|---|---|---|---|
| Professor, Engineer, moderator, scoring | `openai/gpt-oss-120b` | `gemini-flash-latest` | `claude-opus-5-5` |
| Junior, cross-challenge checks | `openai/gpt-oss-20b` | `gemini-flash-lite-latest` | same model |
| Tokens per call | ~1.6–3.5k in, ~100–300 out | similar | similar |
| One 12-question session | ~53k input tokens over ~30 calls, measured with `agents.profile_tokens` (was 81k before optimisation) | same prompts | — |
| Free-tier limit | 8k tokens/min and 200k tokens/day per model | per-minute and per-day request limits per model | — |

Every call walks a fallback chain: primary big model → primary small model → Gemini flash → Gemini flash-lite (fast
calls start at the small models). Rate limits, server errors and calls slower than 45 s move to the next model; a
model that hits a daily cap is skipped for the rest of the day. A session only stops if every model is out. Switching
provider is one line in `.env` (`VIVA_PROVIDER`).

## 9. Code map

| Path | What |
|---|---|
| `agents/panel.py` | Session flow; edge-case enforcement; tool events |
| `agents/moderator.py` | Topic planning; turn-taking |
| `agents/examiner.py` | Examiner moves; Engineer tool loop; grounding checks |
| `agents/scoring.py` | Report: numbers in code, narrative from the model |
| `agents/guardrails.py` | Answer classifier; reference and question checks |
| `agents/llm.py` | Groq/Gemini/Claude calls; structured outputs; tool loop; cross-provider fallback |
| `agents/tools.py` | `read_file`/`search_code` over a checkout; mock test runner |
| `agents/eval.py`, `agents/quality.py` | Scripted-student evals and question metrics |
| `agents/prompts/*.md` | One prompt per agent, plus shared panel rules |
| `docs/api-contract.md` | Endpoints, event format, tool and report shapes |
