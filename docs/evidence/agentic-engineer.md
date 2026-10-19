# The Engineer as a tool-using agent (evidence)

Since Day 4 the Engineer doesn't just receive tool output from code: it runs a **function-calling loop**
(`agents/llm.py:agent_loop`). It chooses which tools to call, reads each result, decides whether it needs another
one, and finishes by calling `submit` with its decision, which is validated against a Pydantic schema.

| Tool | What it does | Implemented in |
|---|---|---|
| `read_file` | read a repo file with line numbers (path-safe, inside the repo only) | `agents/tools.py:LocalRepoTools` |
| `search_code` | case-insensitive search across the repo | `agents/tools.py:LocalRepoTools` |
| `run_tests` | run the project's tests in the sandbox (once per session) | backend sandbox (B); `mock_test_runner` until then |
| `submit` | final decision (`RespondDecision` / `VerifyDecision`) | schema in `agents/schemas.py` |

Two moves use it:

- **Judging an Engineer question** (`Examiner.respond_agentic`): tools `read_file` and `search_code`, up to 3 calls.
- **Verifying a testable claim** from *any* examiner's turn (`Examiner.verify_agentic`): `run_tests` plus
  `read_file`/`search_code`. Code guarantees the tests run; if the agent skips `run_tests`, the panel runs it and judges the real result.

Every call streams to the UI as two events (`tool_used` set): the Engineer announcing it ("Let me search the code
for “teardown”.", with its reason in `reasoning`), then a `system` event with the result. Every call is also stored
as a `ToolRecord` and listed under **Code checks by the Engineer** in the report.

## Live traces (Groq, 2026-10-20, mock repo `agents/mock_data/campus-library-api/`)

All three ran on `openai/gpt-oss-20b`; the 120b model was rate-limited and the fallback took over.

### 1. Catching a false claim about the code

> **Student:** "It is fine, I close the connection after every request in a teardown hook in main.py, so nothing leaks."

The snippet in the summary can't settle this, so the agent investigated:

```
read_file   {"path": "app/main.py", "why": "Check for connection teardown handling"}
search_code {"query": "teardown", "why": "Check for connection close"}        -> 0 matches
read_file   {"path": "app/main.py", "start_line": 1, ...}
submit      verdict = weak
```

> **Judgement:** "The student claims that connections are closed in a teardown hook, but the code in app/main.py shows
> no such cleanup; get_connection opens a new SQLite connection per request and never closes it, leading to resource
> exhaustion under load."

### 2. Checking whether passing tests actually prove the claim

> **Claim:** "My tests cover double-borrowing; test_borrow_twice_returns_409 passes."

```
run_tests  {"test_path": "tests/test_loans.py", "why": "Check double-borrowing test"}   -> passed, 2/2
read_file  {"path": "tests/test_loans.py", "why": "Inspect test to see if concurrent requests exercised"}
submit     outcome = contradicted  ->  corrected to inconclusive by code (see below)
```

> **Explanation:** "test_borrow_twice_returns_409 passes, but the test does not exercise concurrent requests; thus the
> claim that the code safely handles double-borrowing is unsupported."
> **Question:** "How would you modify borrow_book to safely prevent a race condition when two users borrow the same copy at the same time?"

The agent read the test *after* seeing it pass, to check what it exercises: the step that separates real verification
from "the tests are green". It labelled the outcome `contradicted` while its own explanation said "unsupported";
a new code guardrail turns `contradicted` into `inconclusive` when the run has no failures.

### 3. In a full session: the agent picks the tests itself

During a full panel run, the Professor asked about token expiry and the student's answer was flagged as testable.
The Engineer chose `tests/test_auth.py`, saw 3 passed, and concluded: "The test suite does not cover token
expiration, so the claim remains unverified."

## Bugs these runs found (fixed)

- `verify_agentic` rebound `run_tests` inside its own wrapper, so the sandbox call recursed forever. The tool loop
  caught the error and the agent retried, but the tests never ran. Found on the first live run, fixed.
- Groq sometimes returns `400 output_parse_failed` when the model writes plain text instead of a tool call. The loop now
  retries, and if the loop still fails, the Engineer judges without tools rather than ending the viva.

## Limits

- Each tool call resends the conversation, so an agentic turn costs about 2–4× the tokens of a plain one. On Groq's
  free tier (8k tokens/min, 200k/day per model) both models ran out of daily budget during this testing.
- `VIVA_AGENT_TOOL_CALLS` (default 3) caps calls per decision.
