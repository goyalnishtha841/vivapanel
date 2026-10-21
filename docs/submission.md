# Submission form answers (copy-paste)

Answers for each field of the Ziro "Build & Submit" form. Fields marked **TODO** need a link we don't have yet.

---

**Project name**

Viva Panel: A Multi-Agent AI Examiner Panel That Grills You on Your Own Project

**Tools used**

Groq (openai/gpt-oss-120b, gpt-oss-20b) with function calling, Gemini flash (automatic backup), Python, FastAPI, Pydantic, server-sent events, GitHub API + git, Docker and E2B (isolated test sandbox), pytest, SQLite, React 18, Vite, Tailwind CSS, Framer Motion, Web Speech API (voice in and out), Render, GitHub Actions

**Demo URL**

https://viva-panel.onrender.com

**2–3 min demo video URL**

**TODO**

**GitHub URL**

https://github.com/goyalnishtha841/vivapanel

**Presentation URL**

**TODO**

---

**Agent architecture**

Viva Panel is six cooperating agents around one shared transcript, with code enforcing the rules:

1. **Reader agent:** explores the GitHub repo with `read_file` and `search_code`, picks the files worth examining and writes a project summary. Code checks that every path and function it names really exists.
2. **Moderator agent:** picks two topics per examiner, each anchored to a real file, so questions never overlap, and hands over turn by turn.
3. **Professor:** design and theory ("why this design, what are the trade-offs?").
4. **Industry Engineer:** scale, edge cases and security. A tool-using agent that runs its own function-calling loop: it reads and searches the code, and calls `run_tests` to run the student's own pytest suite in an isolated sandbox (Docker or an E2B microVM; no network during tests, memory, CPU and time limits).
5. **Curious Junior:** "explain it simply" questions that expose shallow understanding.
6. **Scoring agent:** turns the transcript and test results into a report with weak spots, per-topic confidence and a study plan.

Every examiner judges each answer against the real code (strong, partial, weak or no answer), then decides whether to follow up, let a colleague challenge, or hand over. The design rule is **the model makes the judgement calls; code makes the guarantees**: cited files must exist, questions are short and never repeated, "I don't know" is always no answer, prompt injection can never score above weak, scores are computed from verdicts, and every quote in the report is copied from the transcript. Every agent turn streams to the browser as an event with the speaker, the reasoning and the file, so the screen shows who is asking and why.

Full design with diagrams: https://github.com/goyalnishtha841/vivapanel/blob/main/docs/architecture.md

**Solution & agent workflow**

Problem: final-year students struggle to explain and defend their own projects in vivas and interviews, especially now that AI writes much of the code. Friends go easy on them, and existing tools analyse code without testing whether the student understands it.

Workflow:
1. The student pastes a public GitHub link (on a team project, they pick which contributor they are, and the panel focuses on files they wrote, from the git history).
2. The reader agent explores the repo; the moderator plans topics for the three examiners.
3. The panel session runs live, by text or voice (a different voice per examiner, plus hands-free mode). The screen highlights the examiner who is speaking, the reason for the question and the file it is about, opened in a code viewer.
4. Vague answers get sharper follow-ups; examiners challenge or extend each other's verdicts.
5. When the student makes a testable claim ("my tests cover that"), the Engineer runs the repo's tests in the sandbox, reads the test file and rules whether the result supports, contradicts or can't prove the claim.
6. After about 5 minutes (12 questions), the scoring agent produces a report: a score, confidence per topic, weak spots quoting the student's own answers, the test evidence, unanswered questions and a personalised study plan. A re-viva targets the weakest topics.
7. Hiring mode: a recruiter creates an interview link with a role and skills to probe; the candidate takes the same viva, and the recruiter gets a private evidence-backed summary with a score per skill.

Resilience: if Groq hits a rate limit mid-session, Gemini takes over (including the Engineer's tool loop) without stopping the viva.

**Test cases / proof of working agent**

Official test case (one labelled run): paste a repo, three examiners question the student, challenge weak answers and each other, the Engineer verifies a claim by running the tests, and a scored report follows.

Input: sample repo campus-library-api, scripted student answers (one vague, one strong, one testable claim, several non-answers).
Expected: topics split without overlap; questions cite real files; weak answer challenged; examiner-to-examiner challenge; Engineer runs tests on a claim; report with weak spots, evidence, study plan.
Actual (Groq, 20 Oct 2026): all expected steps happened. 12 questions, every one citing a real file (0 invalid references); the vague answer was judged weak and followed up; 2 cross-challenges; the student's claim "my tests cover double-borrowing" made the Engineer run tests/test_loans.py (2 passed), read the test and rule the claim inconclusive, because the test doesn't send concurrent requests; report 26/100 with 6 topics, quoted weak spots, test evidence and a study plan.
Differences, explained: (1) the sample project's test output is recorded for speed; for real repos the same tool runs the student's own pytest suite in the sandbox (verified locally on pallets/markupsafe: 12 passed, network blocked). (2) Voice runs in the browser, so it's shown in the video, not the log. (3) Answers were scripted for repeatability.
Also: edge cases 7/7 live (repeat, idk, one word, empty, prompt injection, off-topic, pasted code); live Groq-to-Gemini failover; 131 automated tests in CI.

Full labelled run with evidence files: https://github.com/goyalnishtha841/vivapanel/blob/main/docs/test-case-proof.md
