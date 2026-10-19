# Viva Panel — Shared Contract (Step 0)

This file is the single source of truth between Member A (agents), Member B (backend/tools)
and Member C (frontend). Change it only after telling the other two.
The Python versions of these shapes live in `agents/schemas.py` — import them, don't redefine them.

---

## 1. HTTP API (FastAPI, owned by B)

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/session` | `{"repo_url": "https://github.com/owner/name"}` | `{"session_id": "abc123"}` |
| `POST` | `/answer` | `{"session_id": "abc123", "answer": "student's reply"}` | `{"ok": true}` |
| `GET` | `/stream/{id}` | — | Server-sent events, one `data:` line per **Event** (below) |
| `GET` | `/report/{id}` | — | **Report** JSON (section 6) |
| `GET` | `/health` | — | `{"status": "ok"}` |

Errors: `{"error": "<code>", "detail": "<human message>"}` with codes
`invalid_url`, `private_repo`, `repo_too_large`, `llm_failed`, `session_not_found`.

---

## 2. Event format (every agent turn)

```json
{
  "speaker":   "professor",
  "message":   "In db.py, get_connection() opens a new SQLite connection per request. Why not a pool?",
  "reasoning": "README claims 'production-ready'; per-request connections contradict that. Probing design justification.",
  "file_ref":  "app/db.py:get_connection",
  "tool_used": null,
  "timestamp": "2026-10-20T10:15:02Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `speaker` | string | one of `professor`, `engineer`, `junior`, `moderator`, `system`, `student` |
| `message` | string | what is shown / spoken aloud |
| `reasoning` | string | why the agent said it (shown in the reasoning sidebar) |
| `file_ref` | string \| null | `path` or `path:function`. Must exist in the repo (guardrail). |
| `tool_used` | string \| null | one of the tool names below, or null |
| `timestamp` | string | ISO-8601 UTC |

Frontend rule: highlight the card whose name equals `speaker`. When `tool_used` is set, show
"<Speaker> is running <tool>…".

---

## 3. Tool names (implemented by B, called by A's agents)

| Tool | Input | Output |
|---|---|---|
| `fetch_repo_tree` | `{"repo_url"}` | `{"files": ["path", ...], "truncated": bool}` |
| `read_file` | `{"path", "max_bytes"?}` | `{"path", "content", "truncated": bool}` |
| `search_code` | `{"query", "max_results"?}` | `{"matches": [{"path", "line", "text"}]}` |
| `run_tests` | `{"test_path"?, "timeout_s"?}` | **RunTestsResult** (below) |

### RunTestsResult (agreed Day 0 so A and B don't block each other)

```json
{
  "status": "passed",            // passed | failed | error | timeout
  "command": "pytest -q tests/test_auth.py",
  "passed": 12, "failed": 1, "errors": 0, "skipped": 0,
  "duration_s": 4.2,
  "failing_tests": ["tests/test_auth.py::test_expired_token"],
  "output_tail": "last ~60 lines of stdout/stderr"
}
```

Sandbox limits (B): no network, read-only repo copy, 512 MB memory, 1 CPU, 60 s timeout.

---

## 4. ProjectSummary (produced by B's repo reader, consumed by A's agents)

See `agents/mock_data/mock_summary.json` for a full example. Key fields:
`repo_url, name, one_liner, tech_stack[], readme_claims[], files[], key_files[{path, purpose, functions[], snippet}], has_tests, test_command`.

---

## 5. Sandbox events (Day 3)

When the Engineer checks a claim, the stream carries three events in a row:

1. `{"speaker": "engineer", "tool_used": "run_tests", "message": "That's a testable claim. Let me run tests/test_loans.py in the sandbox.", "file_ref": "tests/test_loans.py"}` — show a spinner: "Engineer is running tests…"
2. `{"speaker": "system", "tool_used": "run_tests", "message": "Sandbox: passed — 2 passed, 0 failed (1.8s)", "reasoning": "pytest -q tests/test_loans.py"}` — the raw result
3. `{"speaker": "engineer", "tool_used": null, "reasoning": "[test inconclusive] <claim>", "message": "<what the result means> <question>"}` — `reasoning` starts with `[test supported]`, `[test contradicted]` or `[test inconclusive]`

### Tool calls by the agentic Engineer

Every `read_file` / `search_code` / `run_tests` call the Engineer makes streams as a pair:

1. `{"speaker": "engineer", "tool_used": "search_code", "message": "Let me search the code for “teardown”.", "reasoning": "<why>"}`
2. `{"speaker": "system", "tool_used": "search_code", "message": "Search “teardown”: 0 match(es)", "reasoning": "<first matches>"}`

For `read_file` the result message is "Read app/main.py (17 lines)", with `file_ref` set to the path. Suggested UI:
show these in the reasoning sidebar as an activity log and don't read them aloud.

## 6. Report (GET /report/{id})

Defined as `Report` in `agents/schemas.py`. Example: `docs/evidence/2026-10-20-groq-live-report.json`.

| Field | Notes |
|---|---|
| `overall_score` | 0–100, average of topic confidences (computed in code from verdicts) |
| `readiness` | `ready` · `almost_ready` · `needs_work` · `not_ready` |
| `headline` | one sentence |
| `topics[]` | `{topic, examiner, file_ref, confidence (null = not reached), verdicts[], note, evidence[]}` |
| `weak_spots[]` | `{title, file_ref, why, evidence[]}` — evidence quotes are copied from the transcript, not generated |
| `unanswered[]` | `{turn, examiner, question, file_ref, answer}` |
| `test_evidence[]` | `{turn, claim, test_path, result: RunTestsResult, outcome, explanation}` |
| `code_checks[]` | `{turn, examiner, tool, args, summary}`: every tool call the Engineer made |
| `study_plan[]` | `{title, action, file_ref, minutes}` |
| `recruiter_summary` | 3–4 sentences |

`Quote` = `{turn, speaker, text}`.

## 7. Test repos (fill in together)

| # | Repo | Language | Has tests | Sandbox works? |
|---|---|---|---|---|
| 1 | (our own project) | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
