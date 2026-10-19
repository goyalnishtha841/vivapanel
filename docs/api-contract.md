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
| `GET` | `/report/{id}` | — | **Report** JSON (defined Day 3) |
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

## 5. Test repos (fill in together)

| # | Repo | Language | Has tests | Sandbox works? |
|---|---|---|---|---|
| 1 | (our own project) | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
