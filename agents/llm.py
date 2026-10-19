"""Thin wrapper around the LLM so every agent calls the model the same way.

Providers (VIVA_PROVIDER):
  anthropic  — Claude via the Anthropic SDK (default)
  groq       — Groq-hosted open models via the Groq SDK
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

PROVIDER = os.getenv("VIVA_PROVIDER", "anthropic").lower()
MODEL = (
    os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    if PROVIDER == "groq"
    else os.getenv("VIVA_MODEL", "claude-opus-5-5")
)
# Smaller model for cheap side decisions (e.g. "should I interject?"). Has its own rate limit on Groq.
FAST_MODEL = (
    os.getenv("GROQ_FAST_MODEL", "openai/gpt-oss-20b")
    if PROVIDER == "groq"
    else os.getenv("VIVA_FAST_MODEL", MODEL)
)
EFFORT = os.getenv("VIVA_EFFORT", "low")  # low keeps viva turns snappy; raise for scoring

T = TypeVar("T", bound=BaseModel)


def is_offline() -> bool:
    """Offline when forced, or when the chosen provider has no credentials."""
    if os.getenv("VIVA_OFFLINE", "0") == "1":
        return True
    if PROVIDER == "groq":
        return not os.getenv("GROQ_API_KEY")
    return not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))


class LLMError(RuntimeError):
    pass


class RateLimited(LLMError):
    pass


DEBUG = os.getenv("VIVA_DEBUG", "0") == "1"
_big_model_exhausted = False

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
        print(f"  [llm] {schema.__name__:<17} {model:<22} {time.time() - started:5.1f}s "
              f"in={tokens_in} out={tokens_out}", file=sys.stderr)


def structured_call(system: str, user: str, schema: type[T], effort: str | None = None, fast: bool = False) -> T:
    """One model call that must return an instance of `schema`. fast=True uses the smaller model."""
    global _big_model_exhausted
    model = FAST_MODEL if fast or _big_model_exhausted else MODEL
    call = _groq_call if PROVIDER == "groq" else _anthropic_call
    try:
        return call(system, user, schema, effort or EFFORT, model)
    except RateLimited as e:
        # The big model's budget is spent (e.g. Groq's daily token cap): finish the turn on the fast model
        # rather than stalling the viva. It has its own, separate budget.
        if model == FAST_MODEL:
            raise
        if "per day" in str(e) or "TPD" in str(e):
            _big_model_exhausted = True  # daily cap: stop trying the big model for the rest of this process
        print(f"  [llm] {model} rate-limited, falling back to {FAST_MODEL}: {str(e)[:120]}", file=sys.stderr)
        return call(system, user, schema, effort or EFFORT, FAST_MODEL)


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
    global _big_model_exhausted
    model = FAST_MODEL if fast or _big_model_exhausted else MODEL
    submit = Tool(SUBMIT, f"Submit your final {final.__name__}. Call this exactly once, when you are done "
                          "investigating.", _strict_schema(final))
    loop = _groq_agent if PROVIDER == "groq" else _anthropic_agent
    try:
        return (yield from loop(system, user, tools, submit, execute, final, max_tool_calls, model))
    except RateLimited as e:
        if model == FAST_MODEL:
            raise
        if "per day" in str(e) or "TPD" in str(e):
            _big_model_exhausted = True
        print(f"  [llm] {model} rate-limited in agent loop, restarting on {FAST_MODEL}", file=sys.stderr)
        return (yield from loop(system, user, tools, submit, execute, final, max_tool_calls, FAST_MODEL))


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
