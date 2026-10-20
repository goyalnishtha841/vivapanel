"""Team projects: who wrote what, from the repo's own git history.

The real viva question on a team project is "did *you* write this?". Before the clone's history is deleted, this
module matches the student (a GitHub login) to their commits and counts, per file, how many of the commits that
touched it were theirs. The panel then examines them mainly on files they actually wrote.

Matching a login to git authors: one GitHub API call lists the student's recent commits, which gives the email
and name they commit with; locally, a commit counts as theirs if its SHA, email or name matches, or if the email
is their GitHub noreply address.
"""
from __future__ import annotations

import json
import re
import subprocess
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

from agents.schemas import FileOwnership, StudentWork

from . import config

LOGIN = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
MAX_COMMITS = 3000
MAX_FILES = 20
BOT = re.compile(r"\[bot\]$|^(dependabot|github-actions|renovate)", re.I)


def _get(url: str):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "viva-panel"})
    if config.GITHUB_TOKEN:
        req.add_header("Authorization", f"Bearer {config.GITHUB_TOKEN}")
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)


def contributors(owner: str, name: str) -> list[dict]:
    """Human contributors by commit count (GitHub's list). Empty if GitHub can't be reached."""
    try:
        data = _get(f"https://api.github.com/repos/{owner}/{name}/contributors?per_page=30")
    except (urllib.error.URLError, TimeoutError, ValueError):
        return []
    return [{"login": c["login"], "commits": c.get("contributions", 0), "avatar_url": c.get("avatar_url", "")}
            for c in data if isinstance(c, dict) and c.get("type") == "User" and not BOT.search(c.get("login", ""))]


def identities(owner: str, name: str, login: str) -> tuple[set[str], set[str], set[str]]:
    """(shas, emails, names) the student commits with, from their recent commits on this repo."""
    try:
        data = _get(f"https://api.github.com/repos/{owner}/{name}/commits?author={login}&per_page=100")
    except (urllib.error.URLError, TimeoutError, ValueError):
        data = []
    shas, emails, names = set(), set(), {login.lower()}
    for c in data if isinstance(data, list) else []:
        shas.add(c.get("sha", ""))
        author = (c.get("commit") or {}).get("author") or {}
        if author.get("email"):
            emails.add(author["email"].lower())
        if author.get("name"):
            names.add(author["name"].lower())
    return shas, emails, names


def git_log(root: Path) -> list[tuple[str, str, str, list[str]]]:
    """(sha, author name, author email, files) for each non-merge commit, newest first."""
    out = subprocess.run(
        ["git", "-C", str(root), "log", "--no-merges", f"-n{MAX_COMMITS}", "--format=%x1e%H%x1f%an%x1f%ae", "--name-only"],
        capture_output=True, text=True, timeout=60, check=True,
    ).stdout
    commits = []
    for rec in out.split("\x1e")[1:]:
        head, _, body = rec.partition("\n")
        sha, an, ae = (head.split("\x1f") + ["", "", ""])[:3]
        commits.append((sha, an, ae.lower(), [f for f in body.splitlines() if f.strip()]))
    return commits


def analyse(commits, login: str, shas: set[str], emails: set[str], names: set[str], files: list[str],
            teammates: list[str]) -> StudentWork | None:
    noreply = re.compile(rf"(^|\+){re.escape(login.lower())}@users\.noreply\.github\.com$")
    current = set(files)
    mine_n, total = 0, defaultdict(lambda: [0, 0])
    for sha, an, ae, changed in commits:
        mine = sha in shas or ae in emails or an.lower() in names or bool(noreply.search(ae))
        mine_n += mine
        for f in changed:
            if f in current:
                total[f][1] += 1
                total[f][0] += mine
    if not mine_n:
        return None
    owned = sorted((FileOwnership(path=f, by_student=m, total=t) for f, (m, t) in total.items() if m),
                   key=lambda o: (not o.owned, -o.by_student, o.path))
    return StudentWork(login=login, commits=mine_n, team_commits=len(commits), teammates=teammates[:6],
                       files=owned[:MAX_FILES])
