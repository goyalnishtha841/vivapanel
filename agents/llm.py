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


def _log(model: str, schema: type, started: float, tokens_in: int, tokens_out: int) -> None:
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
                max_completion_tokens=4000,
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
