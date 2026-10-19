"""Thin wrapper around the Claude API so every agent calls the model the same way."""
from __future__ import annotations

import os
from typing import TypeVar

import anthropic
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

MODEL = os.getenv("VIVA_MODEL", "claude-opus-5-5")
EFFORT = os.getenv("VIVA_EFFORT", "low")  # low keeps viva turns snappy; raise for scoring

T = TypeVar("T", bound=BaseModel)


def is_offline() -> bool:
    """Offline when forced, or when no credentials are configured."""
    if os.getenv("VIVA_OFFLINE", "0") == "1":
        return True
    return not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))


class LLMError(RuntimeError):
    pass


_client: anthropic.Anthropic | None = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(max_retries=3, timeout=60.0)
    return _client


def structured_call(system: str, user: str, schema: type[T], effort: str | None = None) -> T:
    """One model call that must return an instance of `schema`."""
    try:
        response = client().messages.parse(
            model=MODEL,
            max_tokens=4000,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=schema,
            output_config={"effort": effort or EFFORT},
        )
    except anthropic.RateLimitError as e:
        raise LLMError(f"rate limited: {e.message}") from e
    except anthropic.APIStatusError as e:
        raise LLMError(f"API error {e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise LLMError("network error talking to Claude") from e

    if response.stop_reason == "refusal":
        raise LLMError("model declined this request")
    if response.stop_reason == "max_tokens" or response.parsed_output is None:
        raise LLMError(f"incomplete structured output (stop_reason={response.stop_reason})")
    return response.parsed_output
