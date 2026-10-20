"""Moderator text that's assembled in code."""
import pytest

from agents.moderator import _soft_lower


@pytest.mark.parametrize("title, expected", [
    ("What Is MarkupSafe", "what is MarkupSafe"),          # Title Case from the model -> sentence case
    ("Fallback Implementation Strategy", "fallback implementation strategy"),
    ("C Speedup Memory Safety", "C speedup memory safety"),
    ("Password hashing choice", "password hashing choice"),
    ("JWT expiry handling", "JWT expiry handling"),        # acronyms keep their capitals
    ("SQLite vs scalability trade-offs", "SQLite vs scalability trade-offs"),
    ("__html__ protocol", "__html__ protocol"),
])
def test_topic_titles_read_naturally_mid_sentence(title, expected):
    assert _soft_lower(title) == expected
