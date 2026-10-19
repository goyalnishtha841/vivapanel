"""Thin wrapper around the LLM so every agent calls the model the same way.

Providers: groq (Groq-hosted open models), gemini (Google), anthropic (Claude).
VIVA_PROVIDER picks the primary; VIVA_BACKUP_PROVIDER (default: gemini, if GEMINI_API_KEY is set) is used
when the primary is rate-limited or overloaded. Each call walks a chain of (provider, model) routes:

    big call:  primary big  -> primary fast -> backup big -> backup fast
    fast call: primary fast -> backup fast  -> backup big

A route that hits a *daily* cap is skipped for the rest of the process.
"""
from __future__ import annotations

import json
import os
import sys
import time
from collections.abc import Callable
from typing import Any, TypeVar

from dotenv import load_dotenv
from pydantic import BaseModel, ValidationError

load_dotenv()

MODELS = {  # provider -> (big model, fast model)
    "groq": (os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"), os.getenv("GROQ_FAST_MODEL", "openai/gpt-oss-20b")),
    "gemini": (os.getenv("GEMINI_MODEL", "gemini-flash-latest"), os.getenv("GEMINI_FAST_MODEL", "gemini-flash-lite-latest")),
    "anthropic": (os.getenv("VIVA_MODEL", "claude-opus-5-5"), os.getenv("VIVA_FAST_MODEL", os.getenv("VIVA_MODEL", "claude-opus-5-5"))),
}
KEYS = {"groq": ("GROQ_API_KEY",), "gemini": ("GEMINI_API_KEY",), "anthropic": ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}

PROVIDER = os.getenv("VIVA_PROVIDER", "anthropic").lower()
BACKUP = os.getenv("VIVA_BACKUP_PROVIDER", "gemini" if os.getenv("GEMINI_API_KEY") else "").lower()
if BACKUP == PROVIDER:
    BACKUP = ""
MODEL, FAST_MODEL = MODELS.get(PROVIDER, MODELS["anthropic"])
EFFORT = os.getenv("VIVA_EFFORT", "low")  # low keeps viva turns snappy; raise for scoring

T = TypeVar("T", bound=BaseModel)


def _has_key(provider: str) -> bool:
    return any(os.getenv(k) for k in KEYS.get(provider, ()))


def is_offline() -> bool:
    """Offline when forced, or when neither the primary nor the backup provider has credentials."""
    if os.getenv("VIVA_OFFLINE", "0") == "1":
        return True
    return not (_has_key(PROVIDER) or (BACKUP and _has_key(BACKUP)))


class LLMError(RuntimeError):
    pass


class RateLimited(LLMError):
    """Rate-limited or overloaded: worth trying the next route."""


DEBUG = os.getenv("VIVA_DEBUG", "0") == "1"
_exhausted: set[tuple[str, str]] = set()  # routes that hit a daily cap

# Output caps per call type (Groq counts hidden reasoning in these too). Generous enough to never cut a
# valid decision short, tight enough that a runaway answer can't burn the budget.
MAX_OUTPUT = {"QuestionDecision": 1200, "RespondDecision": 1500, "ChallengeDecision": 1000, "VerifyDecision": 1200,
              "PanelPlan": 2500, "ReportNarrative": 3000, "SummaryDraft": 3000}


def _cap(schema: type) -> int:
    return MAX_OUTPUT.get(schema.__name__, 2000)


# Every real call's token usage, as reported by the provider: [{call, model, input, output, seconds}].
# Read it (and reset it) to measure a session; see agents/profile_tokens.py.
USAGE: list[dict] = []


def _log(model: str, schema: type, started: float, tokens_in: int, tokens_out: int) -> None:
    USAGE.append({"call": schema.__name__, "model": model, "input": tokens_in, "output": tokens_out,
                  "seconds": round(time.time() - started, 2)})
    if DEBUG:
        print(f"  [llm] {schema.__name__:<17} {model:<26} {time.time() - started:5.1f}s "
              f"in={tokens_in} out={tokens_out}", file=sys.stderr)


def routes(fast: bool) -> list[tuple[str, str]]:
    """The (provider, model) order to try for one call, skipping routes without a key or past a daily cap."""
    chain: list[tuple[str, str]] = []
    for prov in [PROVIDER] + ([BACKUP] if BACKUP else []):
        if not _has_key(prov):
            continue
        big, small = MODELS[prov]
        if not fast:
            chain += [(prov, big), (prov, small)]
        elif prov == PROVIDER:
            chain += [(prov, small)]
        else:
            chain += [(prov, small), (prov, big)]
    return [r for i, r in enumerate(chain) if r not in chain[:i] and r not in _exhausted]


def _daily(err: Exception) -> bool:
    t = str(err)
    return any(k in t for k in ("per day", "TPD", "PerDay", "per_day", "daily"))


def _walk(fn: Callable[[str, str], T], fast: bool) -> T:
    chain = routes(fast)
    if not chain:
        raise RateLimited("every model's daily limit is used up")
    last: Exception | None = None
    for i, (prov, model) in enumerate(chain):
        try:
            return fn(prov, model)
        except RateLimited as e:
            last = e
            if _daily(e):
                _exhausted.add((prov, model))
            if i + 1 < len(chain):
                print(f"  [llm] {prov}:{model} unavailable ({str(e)[:90]}), trying {chain[i + 1][0]}:{chain[i + 1][1]}",
                      file=sys.stderr)
    raise last


def structured_call(system: str, user: str, schema: type[T], effort: str | None = None, fast: bool = False) -> T:
    """One model call that must return an instance of `schema`. fast=True prefers the smaller model."""
    calls = {"groq": _groq_call, "gemini": _gemini_call, "anthropic": _anthropic_call}
    return _walk(lambda prov, model: calls[prov](system, user, schema, effort or EFFORT, model), fast)


# ---------- Anthropic ----------

_anthropic = None


def _anthropic_call(system: str, user: str, schema: type[T], effort: str, model: str) -> T:
    import anthropic

    global _anthropic
    if _anthropic is None:
        _anthropic = anthropic.Anthropic(max_retries=3, timeout=60.0)
    started = time.time()
    try:
        response = _anthropic.messages.parse(
            model=model,
            max_tokens=4000,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=schema,
            output_config={"effort": effort},
        )
    except anthropic.RateLimitError as e:
        raise RateLimited(f"rate limited: {e.message}") from e
    except anthropic.APIStatusError as e:
        raise LLMError(f"API error {e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise LLMError("network error talking to Claude") from e

    _log(model, schema, started, response.usage.input_tokens, response.usage.output_tokens)
    if response.stop_reason == "refusal":
        raise LLMError("model declined this request")
    if response.stop_reason == "max_tokens" or response.parsed_output is None:
        raise LLMError(f"incomplete structured output (stop_reason={response.stop_reason})")
    return response.parsed_output


# ---------- Groq ----------

_groq = None


def _strict_schema(model: type[BaseModel]) -> dict[str, Any]:
    """Pydantic JSON schema -> strict-mode schema: refs inlined, no defaults, every field required."""
    raw = model.model_json_schema()
    defs = raw.pop("$defs", {})

    def fix(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                return fix(defs[node["$ref"].split("/")[-1]])
            node = {
                k: ({name: fix(sub) for name, sub in v.items()} if k == "properties" else fix(v))
                for k, v in node.items()
                if k not in ("default", "title")
            }
            if node.get("type") == "object":
                node["additionalProperties"] = False
                node["required"] = list(node.get("properties", {}))
            return node
        if isinstance(node, list):
            return [fix(x) for x in node]
        return node

    return fix(raw)


def _groq_call(system: str, user: str, schema: type[T], effort: str, model: str) -> T:
    import groq

    global _groq
    if _groq is None:
        _groq = groq.Groq(max_retries=3, timeout=60.0)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    response_format = {
        "type": "json_schema",
        "json_schema": {"name": schema.__name__, "schema": _strict_schema(schema), "strict": True},
    }
    for attempt in range(2):
        started = time.time()
        try:
            response = _groq.chat.completions.create(
                model=model,
                messages=messages,
                response_format=response_format,
                reasoning_effort=effort if effort in ("low", "medium", "high") else "medium",
                max_completion_tokens=_cap(schema),
            )
        except groq.RateLimitError as e:
            raise RateLimited(f"rate limited: {e.message}") from e
        except groq.BadRequestError as e:
            # Groq validates the schema after generation; one retry usually fixes a stray field.
            if "json_validate_failed" in str(e.message) and attempt == 0:
                continue
            raise LLMError(f"API error {e.status_code}: {e.message}") from e
        except groq.APIStatusError as e:
            raise LLMError(f"API error {e.status_code}: {e.message}") from e
        except groq.APIConnectionError as e:
            raise LLMError("network error talking to Groq") from e

        if response.usage:
            _log(model, schema, started, response.usage.prompt_tokens, response.usage.completion_tokens)
        choice = response.choices[0]
        text = choice.message.content or ""
        try:
            return schema.model_validate(json.loads(text))
        except (json.JSONDecodeError, ValidationError) as e:
            if attempt == 1:
                raise LLMError(f"invalid structured output (finish_reason={choice.finish_reason}): {e}") from e
            messages = messages + [
                {"role": "assistant", "content": text},
                {"role": "user", "content": f"That was not valid JSON for the schema: {e}. Reply again with only the JSON."},
            ]
    raise LLMError("unreachable")


# ---------- Tool-calling agent loop ----------
#
# The model chooses which tools to call, reads each result, and decides what to do next, until it calls the
# `submit` tool whose arguments are the final decision (validated against a Pydantic schema). Each tool call is
# yielded as it happens so the panel can stream it; the final decision is the generator's return value:
#
#     decision = yield from agent_loop(system, user, tools, execute, RespondDecision)

from collections.abc import Callable, Generator  # noqa: E402
from dataclasses import dataclass  # noqa: E402


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON schema for the arguments


@dataclass
class ToolCall:
    """Yielded twice per call: once before it runs (result=None), once with the result."""
    name: str
    args: dict[str, Any]
    result: dict[str, Any] | None = None


SUBMIT = "submit"


def agent_loop(system: str, user: str, tools: list[Tool], execute: Callable[[str, dict], dict], final: type[T],
               max_tool_calls: int = 3, fast: bool = False) -> Generator[ToolCall, None, T]:
    submit = Tool(SUBMIT, f"Submit your final {final.__name__}. Call this exactly once, when you are done "
                          "investigating.", _strict_schema(final))
    loops = {"groq": _groq_agent, "gemini": _gemini_agent, "anthropic": _anthropic_agent}
    chain = routes(fast)
    if not chain:
        raise RateLimited("every model's daily limit is used up")
    for i, (prov, model) in enumerate(chain):
        try:
            # a fallback restarts the investigation on the next route (tool calls are cheap and repeatable)
            return (yield from loops[prov](system, user, tools, submit, execute, final, max_tool_calls, model))
        except RateLimited as e:
            if _daily(e):
                _exhausted.add((prov, model))
            if i + 1 == len(chain):
                raise
            print(f"  [llm] {prov}:{model} unavailable in agent loop, trying {chain[i + 1][0]}:{chain[i + 1][1]}",
                  file=sys.stderr)


def _run_tool(execute, name: str, args: dict) -> dict:
    try:
        return execute(name, args)
    except Exception as e:  # a broken tool must not take the viva down; the model sees the error
        return {"error": f"{type(e).__name__}: {e}"}


def _budget_note(used: int, limit: int) -> str:
    left = limit - used
    return (f"(tool calls left: {left})" if left > 0
            else "(no tool calls left — call `submit` now with your final decision)")


def _groq_agent(system, user, tools, submit, execute, final, max_tool_calls, model):
    import groq

    global _groq
    if _groq is None:
        _groq = groq.Groq(max_retries=3, timeout=60.0)

    def spec(t: Tool) -> dict:
        return {"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.parameters}}

    messages: list[dict] = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    used, failures = 0, 0
    while True:
        out_of_budget = used >= max_tool_calls
        available = [submit] if out_of_budget else tools + [submit]
        started = time.time()
        try:
            response = _groq.chat.completions.create(
                model=model, messages=messages, tools=[spec(t) for t in available],
                # Groq accepts a forced call, so once the budget is spent we force the final answer.
                tool_choice={"type": "function", "function": {"name": SUBMIT}} if out_of_budget else "auto",
                reasoning_effort=EFFORT if EFFORT in ("low", "medium", "high") else "medium",
                max_completion_tokens=_cap(final) + 600,
            )
        except groq.RateLimitError as e:
            raise RateLimited(f"rate limited: {e.message}") from e
        except groq.BadRequestError as e:
            failures += 1
            if failures <= 2 and any(k in str(e.message).lower() for k in ("tool", "parse", "failed_generation")):
                continue  # the model produced a malformed tool call or plain text; ask again
            raise LLMError(f"API error {e.status_code}: {e.message}") from e
        except groq.APIStatusError as e:
            raise LLMError(f"API error {e.status_code}: {e.message}") from e
        except groq.APIConnectionError as e:
            raise LLMError("network error talking to Groq") from e
        if response.usage:
            _log(model, final, started, response.usage.prompt_tokens, response.usage.completion_tokens)

        msg = response.choices[0].message
        calls = msg.tool_calls or []
        if not calls:
            failures += 1
            if failures > 3:
                raise LLMError("agent never submitted a decision")
            messages += [{"role": "assistant", "content": msg.content or ""},
                         {"role": "user", "content": "Use a tool, or call `submit` with your final decision."}]
            continue
        messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": [
            {"id": c.id, "type": "function", "function": {"name": c.function.name, "arguments": c.function.arguments}}
            for c in calls
        ]})
        for c in calls:
            try:
                args = json.loads(c.function.arguments or "{}")
            except json.JSONDecodeError:
                args = None
            if c.function.name == SUBMIT and args is not None:
                try:
                    return final.model_validate(args)
                except ValidationError as e:
                    result = {"error": f"invalid decision: {e}. Call submit again with valid arguments."}
            elif args is None:
                result = {"error": "arguments were not valid JSON"}
            elif used >= max_tool_calls or c.function.name not in {t.name for t in tools}:
                result = {"error": "tool not available now — call submit"}
            else:
                used += 1
                yield ToolCall(c.function.name, args)
                result = _run_tool(execute, c.function.name, args)
                yield ToolCall(c.function.name, args, result)
            messages.append({"role": "tool", "tool_call_id": c.id,
                             "content": json.dumps(result)[:6000] + " " + _budget_note(used, max_tool_calls)})


def _anthropic_agent(system, user, tools, submit, execute, final, max_tool_calls, model):
    import anthropic

    global _anthropic
    if _anthropic is None:
        _anthropic = anthropic.Anthropic(max_retries=3, timeout=60.0)

    def spec(t: Tool) -> dict:
        return {"name": t.name, "description": t.description, "input_schema": t.parameters}

    messages: list[dict] = [{"role": "user", "content": user}]
    used, nudges = 0, 0
    while True:
        out_of_budget = used >= max_tool_calls
        available = [submit] if out_of_budget else tools + [submit]
        started = time.time()
        try:
            # Forced tool_choice is rejected on Claude Opus 5.5, so the budget note steers it to `submit` instead.
            response = _anthropic.messages.create(
                model=model, max_tokens=8000, system=system, messages=messages,
                tools=[spec(t) for t in available], output_config={"effort": EFFORT},
            )
        except anthropic.RateLimitError as e:
            raise RateLimited(f"rate limited: {e.message}") from e
        except anthropic.APIStatusError as e:
            raise LLMError(f"API error {e.status_code}: {e.message}") from e
        except anthropic.APIConnectionError as e:
            raise LLMError("network error talking to Claude") from e
        _log(model, final, started, response.usage.input_tokens, response.usage.output_tokens)
        if response.stop_reason == "refusal":
            raise LLMError("model declined this request")

        uses = [b for b in response.content if b.type == "tool_use"]
        messages.append({"role": "assistant", "content": response.content})
        if not uses:
            nudges += 1
            if nudges > 3:
                raise LLMError("agent never submitted a decision")
            messages.append({"role": "user", "content": "Use a tool, or call `submit` with your final decision."})
            continue
        results = []
        for b in uses:
            if b.name == SUBMIT:
                try:
                    return final.model_validate(b.input)
                except ValidationError as e:
                    result, is_error = {"error": f"invalid decision: {e}"}, True
            elif used >= max_tool_calls or b.name not in {t.name for t in tools}:
                result, is_error = {"error": "tool not available now — call submit"}, True
            else:
                used += 1
                yield ToolCall(b.name, b.input)
                result = _run_tool(execute, b.name, b.input)
                is_error = "error" in result
                yield ToolCall(b.name, b.input, result)
            results.append({"type": "tool_result", "tool_use_id": b.id, "is_error": is_error,
                            "content": json.dumps(result)[:6000] + " " + _budget_note(used, max_tool_calls)})
        messages.append({"role": "user", "content": results})


# ---------- Gemini ----------

_gemini = None


def _gemini_client():
    global _gemini
    if _gemini is None:
        from google import genai
        _gemini = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _gemini


def _gemini_errors(e: Exception) -> LLMError:
    from google.genai import errors
    if isinstance(e, errors.APIError):
        if e.code == 429 or (isinstance(e, errors.ServerError) and e.code in (500, 503, 504)):
            return RateLimited(f"gemini {e.code}: {e.message}")
        return LLMError(f"gemini {e.code}: {e.message}")
    return LLMError(f"gemini: {type(e).__name__}: {e}")


def _gemini_config(system: str, max_out: int, **extra):
    from google.genai import types
    return types.GenerateContentConfig(
        system_instruction=system,
        max_output_tokens=max_out + 1500,  # room for the model's own thinking
        thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW),
        **extra,
    )


def _gemini_usage(model: str, schema: type, started: float, r) -> None:
    u = r.usage_metadata
    if u:
        _log(model, schema, started, u.prompt_token_count or 0, (u.candidates_token_count or 0) + (u.thoughts_token_count or 0))


def _gemini_call(system: str, user: str, schema: type[T], effort: str, model: str) -> T:
    from google.genai import types
    contents = [types.Content(role="user", parts=[types.Part(text=user)])]
    config = _gemini_config(system, _cap(schema), response_mime_type="application/json",
                            response_json_schema=_strict_schema(schema))
    for attempt in range(2):
        started = time.time()
        try:
            r = _gemini_client().models.generate_content(model=model, contents=contents, config=config)
        except Exception as e:
            raise _gemini_errors(e) from e
        _gemini_usage(model, schema, started, r)
        text = r.text or ""
        try:
            return schema.model_validate(json.loads(text))
        except (json.JSONDecodeError, ValidationError) as e:
            if attempt == 1:
                reason = r.candidates[0].finish_reason if r.candidates else "?"
                raise LLMError(f"invalid structured output from gemini (finish_reason={reason}): {e}") from e
            contents = contents + [types.Content(role="model", parts=[types.Part(text=text)]),
                                   types.Content(role="user", parts=[types.Part(text=f"That was not valid JSON for the schema: {e}. Reply again with only the JSON.")])]
    raise LLMError("unreachable")


def _gemini_agent(system, user, tools, submit, execute, final, max_tool_calls, model):
    from google.genai import types

    def declare(ts):
        return [types.Tool(function_declarations=[
            types.FunctionDeclaration(name=t.name, description=t.description, parameters_json_schema=t.parameters)
            for t in ts])]

    contents = [types.Content(role="user", parts=[types.Part(text=user)])]
    used, nudges = 0, 0
    while True:
        out_of_budget = used >= max_tool_calls
        available = [submit] if out_of_budget else tools + [submit]
        config = _gemini_config(
            system, _cap(final), tools=declare(available),
            # Gemini can be made to always call a function; once the budget is spent, only `submit` is allowed.
            tool_config=types.ToolConfig(function_calling_config=types.FunctionCallingConfig(
                mode=types.FunctionCallingConfigMode.ANY, allowed_function_names=[t.name for t in available])),
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        started = time.time()
        try:
            r = _gemini_client().models.generate_content(model=model, contents=contents, config=config)
        except Exception as e:
            raise _gemini_errors(e) from e
        _gemini_usage(model, final, started, r)
        calls = r.function_calls or []
        if not calls:
            nudges += 1
            if nudges > 3:
                raise LLMError("agent never submitted a decision")
            contents.append(types.Content(role="user", parts=[types.Part(text="Use a tool, or call `submit` with your final decision.")]))
            continue
        contents.append(r.candidates[0].content)  # keep the model's turn as-is (it carries Gemini's thought signatures)
        responses = []
        for c in calls:
            args = dict(c.args or {})
            if c.name == SUBMIT:
                try:
                    return final.model_validate(args)
                except ValidationError as e:
                    result = {"error": f"invalid decision: {e}. Call submit again with valid arguments."}
            elif used >= max_tool_calls or c.name not in {t.name for t in tools}:
                result = {"error": "tool not available now — call submit"}
            else:
                used += 1
                yield ToolCall(c.name, args)
                result = _run_tool(execute, c.name, args)
                yield ToolCall(c.name, args, result)
            payload = json.loads(json.dumps(result)[:6000]) if len(json.dumps(result)) <= 6000 else {"truncated": json.dumps(result)[:6000]}
            payload["note"] = _budget_note(used, max_tool_calls)
            responses.append(types.Part.from_function_response(name=c.name, response=payload))
        contents.append(types.Content(role="user", parts=responses))
