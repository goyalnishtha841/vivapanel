"""Shared fixtures. Every test runs offline (no keys, no network) against a throwaway data directory."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

# Set before any app module is imported: config reads these at import time, and .env never overrides them.
os.environ["VIVA_OFFLINE"] = "1"
os.environ["VIVA_DATA_DIR"] = tempfile.mkdtemp(prefix="viva-test-")
os.environ["VIVA_STATIC_DIR"] = str(Path(os.environ["VIVA_DATA_DIR"]) / "no-frontend")
os.environ["VIVA_DAILY_SESSIONS"] = "0"
os.environ["VIVA_DAILY_PER_VISITOR"] = "0"
# never touch a real database from .env; set VIVA_TEST_DATABASE_URL to run the suite against Postgres
os.environ["DATABASE_URL"] = os.environ.get("VIVA_TEST_DATABASE_URL", "")

import pytest  # noqa: E402

from agents.schemas import ProjectSummary  # noqa: E402

SUMMARY = Path(__file__).resolve().parents[1] / "agents" / "mock_data" / "mock_summary.json"


@pytest.fixture
def summary() -> ProjectSummary:
    return ProjectSummary.model_validate_json(SUMMARY.read_text())
