"""Backend settings, from environment variables (.env at the repo root)."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

DATA_DIR = Path(os.getenv("VIVA_DATA_DIR", ROOT / "backend" / "data"))
REPOS_DIR = DATA_DIR / "repos"
DB_PATH = DATA_DIR / "viva.sqlite3"

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN") or None
MAX_REPO_KB = int(os.getenv("VIVA_MAX_REPO_KB", "150000"))      # GitHub's size field, in KB
CLONE_TIMEOUT_S = int(os.getenv("VIVA_CLONE_TIMEOUT_S", "90"))
# A public URL shares one set of free-tier LLM keys: cap new sessions per rolling 24 h (0 = no cap).
DAILY_SESSION_LIMIT = int(os.getenv("VIVA_DAILY_SESSIONS", "40"))
# ...and per visitor (hashed IP), so one person can't use up everyone's quota (0 = no cap). Interview links are exempt.
DAILY_PER_VISITOR = int(os.getenv("VIVA_DAILY_PER_VISITOR", "6"))
# Postgres (Neon / Supabase) so sessions and report links survive restarts; empty = SQLite in DATA_DIR.
DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
# Cleanup: repo copies (and their sandboxes) are deleted once a session has been idle this long. Reports stay.
CLEANUP_AFTER_H = float(os.getenv("VIVA_CLEANUP_AFTER_H", "3"))
# Built frontend (frontend/dist); when present the API also serves the app, so one URL does both.
STATIC_DIR = Path(os.getenv("VIVA_STATIC_DIR", ROOT / "frontend" / "dist"))
CORS_ORIGINS = [o.strip() for o in os.getenv("VIVA_CORS_ORIGINS", "http://localhost:5190,http://127.0.0.1:5190").split(",") if o.strip()]

for d in (DATA_DIR, REPOS_DIR):
    d.mkdir(parents=True, exist_ok=True)
