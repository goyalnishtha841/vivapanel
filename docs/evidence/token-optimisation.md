# Token optimisation (evidence)

Prompted by the organizers' feedback (Ziro, 20 Oct 2026): *"Try shortening conversation history, summarizing
previous examiner turns, caching static instructions and restricting unnecessary LLM output."*

## How we measured

`python -m agents.profile_tokens` runs a complete viva through the **real** prompt-building code (moderator,
examiners, the Engineer's tool loop, scoring) with a scripted student, sending every model call to a stand-in
that returns plausible decisions. It counts exactly what each call would send (system prompt + user message +
JSON schema + tool definitions) with the o200k tokenizer used by the gpt-oss models. It's free and deterministic,
so the same session can be measured before and after every change. Baseline numbers come from running the same
profiler against the previous commit (`3bf1a75`) in a separate worktree.

It counts input tokens, which are most of the cost (each call sends ~1.5–2.5k tokens and gets ~100–300 back).

## Results (input tokens per full session)

| Session | Before | After | Change |
|---|---|---|---|
| Sample project (12 questions, 30 model calls) | 81,043 | **52,854** | **−34.8%** |
| `pallets/markupsafe`, a real repo (9 questions, 21 calls) | 54,972 | **38,261** | **−30.4%** |

Our earlier estimate of "25–30k tokens per session" was wrong: the measured baseline was 81k. The figures above
replace it everywhere in the docs.

## What changed, step by step (sample project)

| Step | Session total | Organizer suggestion |
|---|---|---|
| Baseline | 81,043 | — |
| Compact project card in the system prompt (no code, same every call); only the current topic's code goes in the message; transcript compaction (last 4 turns verbatim, older turns one line each with the verdict and the start of the answer) | 62,638 | shorten history · summarise previous turns · cache static instructions |
| Shared panel rules rewritten (476 → 296 tokens, every rule kept) | 57,598 | cache / shrink static instructions |
| Shorter JSON-schema field descriptions (they're sent on every call); cross-examiner challenge check only after strong/partial verdicts; per-call output caps instead of a flat 4,000 | 55,522 | restrict unnecessary output |
| Trimmed Engineer and Junior role prompts; no duplicate file list in the card; tighter judging instructions | **52,854** | — |

**Caching:** the system prompt is now the same on every examiner call in a session (role + rules + project
card) and everything that changes is in the user message, so providers with prompt caching can reuse it.

**Output caps** (`agents/llm.py:MAX_OUTPUT`): 1,000–1,500 tokens for decisions (Groq counts hidden reasoning
in this), 2,500–3,000 for the plan, summary and report, instead of 4,000 for everything.

## Quality

- Offline evals (`agents.eval edge | mixed | large`) all pass after the changes.
- Every rule from the original prompts is still there; only wording was shortened.
- **Not yet done:** the live edge-case eval on the new prompts. Both Groq models hit their daily limit before it
  could run; it will be re-run on the Gemini backup.
