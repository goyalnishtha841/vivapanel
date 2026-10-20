"""Provider fallback: a rate-limited model moves to the next one; a daily cap is remembered."""
import pytest

from agents import llm


@pytest.fixture
def two_providers(monkeypatch):
    monkeypatch.setattr(llm, "PROVIDER", "groq")
    monkeypatch.setattr(llm, "BACKUP", "gemini")
    monkeypatch.setattr(llm, "_has_key", lambda p: p in ("groq", "gemini"))
    monkeypatch.setattr(llm, "_exhausted", set())
    monkeypatch.setattr(llm, "MODELS", {"groq": ("g-big", "g-small"), "gemini": ("m-big", "m-small"),
                                        "anthropic": ("c", "c")})


def test_route_order(two_providers):
    assert llm.routes(fast=False) == [("groq", "g-big"), ("groq", "g-small"), ("gemini", "m-big"), ("gemini", "m-small")]
    assert llm.routes(fast=True) == [("groq", "g-small"), ("gemini", "m-small"), ("gemini", "m-big")]


def test_backup_without_key_is_skipped(two_providers, monkeypatch):
    monkeypatch.setattr(llm, "_has_key", lambda p: p == "groq")
    assert llm.routes(fast=False) == [("groq", "g-big"), ("groq", "g-small")]


def test_rate_limit_falls_through_to_the_next_model(two_providers):
    tried = []

    def call(prov, model):
        tried.append(model)
        if prov == "groq":
            raise llm.RateLimited("429 tokens per minute")
        return f"answer from {model}"

    assert llm._walk(call, fast=False) == "answer from m-big"
    assert tried == ["g-big", "g-small", "m-big"]
    assert llm._exhausted == set()  # per-minute limits are not remembered


def test_daily_cap_is_skipped_for_the_rest_of_the_day(two_providers):
    def call(prov, model):
        if model == "g-big":
            raise llm.RateLimited("Rate limit reached: tokens per day (TPD)")
        return model

    assert llm._walk(call, fast=False) == "g-small"
    assert ("groq", "g-big") in llm._exhausted
    assert llm.routes(fast=False)[0] == ("groq", "g-small")


def test_other_errors_are_not_retried_on_another_model(two_providers):
    def call(prov, model):
        raise llm.LLMError("schema mismatch")

    with pytest.raises(llm.LLMError, match="schema mismatch"):
        llm._walk(call, fast=False)


def test_everything_exhausted(two_providers, monkeypatch):
    monkeypatch.setattr(llm, "_exhausted", {(p, m) for p, m in llm.routes(False) + llm.routes(True)})
    with pytest.raises(llm.RateLimited, match="daily limit"):
        llm._walk(lambda p, m: "never", fast=False)


def test_strict_schema_closes_every_object():
    from agents.schemas import ReportNarrative

    def objects(node):
        if isinstance(node, dict):
            if node.get("type") == "object":
                yield node
            for v in node.values():
                yield from objects(v)
        elif isinstance(node, list):
            for v in node:
                yield from objects(v)

    schema = llm._strict_schema(ReportNarrative)
    assert "$defs" not in schema
    for obj in objects(schema):
        assert obj["additionalProperties"] is False
        assert set(obj["required"]) == set(obj["properties"])
