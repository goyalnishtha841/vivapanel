"""Run real vivas against a deployed Viva Panel and record the evidence the jury asks for.

    python scripts/live_check.py                     # health + the 5-repo study + one hiring-mode run
    python scripts/live_check.py --repos URL URL …   # your own repos instead of the defaults
    python scripts/live_check.py --only health|repos|hiring
    python scripts/live_check.py --base http://localhost:8000

Standard library only. Each viva is answered by a fixed script: a vague answer, a decent one, and, on the third
question, a testable claim ("my tests cover this…") so the Engineer has a reason to run the repo's tests.
Every run is saved to docs/evidence/live-<date>-<repo>.json and summarised as a Markdown table you can paste into
docs/test-case-proof.md. Failures are recorded too, with the error, instead of being skipped.

Each run uses one viva from the deploy's daily quota (VIVA_DAILY_PER_VISITOR, default 6 per visitor), and about
50k model tokens.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_BASE = "https://viva-panel.onrender.com"
# Small public repos. Two have pytest suites, so the sandbox has something to run.
DEFAULT_REPOS = [
    "https://github.com/pallets/markupsafe",             # Python, pytest
    "https://github.com/pallets/itsdangerous",           # Python, pytest
    "https://github.com/miguelgrinberg/microblog",       # Python (Flask app)
    "https://github.com/sindresorhus/slugify",           # JavaScript
    "https://github.com/goyalnishtha841/vivapanel",      # our own project
]
EXAMINERS = {"professor", "engineer", "junior"}
ANSWERS = [
    "It works because I designed it carefully and tested it.",
    "I kept this part simple so it is easy to read; the trade-off is that it is less flexible if requirements change.",
    "My tests cover this case, and the whole test suite passes.",  # a testable claim: the Engineer should check it
    "I'm not sure about that part.",
    "I would add input validation there and handle the error explicitly instead of letting it fail silently.",
    "That function returns early when the input is empty, otherwise it processes each item in order.",
]
EVIDENCE = Path(__file__).resolve().parents[1] / "docs" / "evidence"


def call(base: str, method: str, path: str, body: dict | None = None, timeout: int = 60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={"Content-Type": "application/json", "User-Agent": "viva-live-check"})
    for attempt in range(6):  # a home connection drops DNS now and then; a 4xx/5xx answer is never retried
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.loads(e.read() or b"null")
            except ValueError:
                return e.code, None
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if attempt == 5:
                raise
            print(f"    (network error: {e}; retrying)", flush=True)
            time.sleep(5 * (attempt + 1))


def events_since(base: str, sid: str, after: int, wait_s: float = 4.0) -> list[tuple[int, dict]]:
    """Read the SSE stream for a few seconds and return events with id > after."""
    req = urllib.request.Request(f"{base}/stream/{sid}", headers={"Last-Event-ID": str(after), "Accept": "text/event-stream"})
    out, seq = [], after
    deadline = time.time() + wait_s
    try:
        with urllib.request.urlopen(req, timeout=wait_s + 5) as r:
            while time.time() < deadline:
                line = r.readline().decode("utf-8", "replace").strip()
                if line.startswith("id:"):
                    seq = int(line[3:].strip())
                elif line.startswith("data:"):
                    if seq > after:
                        out.append((seq, json.loads(line[5:].strip())))
                    if out and time.time() > deadline - wait_s + 1:
                        break
    except (TimeoutError, OSError):
        pass
    return out


def viva(base: str, repo: str | None, invite: str | None = None, max_minutes: float = 12,
         resume: str | None = None) -> dict:
    """One full viva. Returns a record with the outcome, the transcript and the report (or the error).
    resume: a session id already started (e.g. by a run that lost its connection), continued instead of a new one."""
    started = time.time()
    rec: dict = {"repo": repo, "invite": bool(invite), "started": dt.datetime.now().isoformat(timespec="seconds")}
    if resume:
        sid = resume
    else:
        body = {"repo_url": repo or ""}
        if invite:
            body["invite"] = invite
        code, res = call(base, "POST", "/session", body)
        if code != 200:
            rec.update(ok=False, stage="start", error=f"{code} {res}")
            return rec
        sid = res["session_id"]
    rec["session_id"] = sid
    events: list[dict] = []
    seq, answered = 0, 0
    while time.time() - started < max_minutes * 60:
        new = events_since(base, sid, seq)
        for s, e in new:
            seq = max(seq, s)
            events.append(e)
        _, st = call(base, "GET", f"/session/{sid}")
        status = (st or {}).get("status")
        if status == "error":
            rec.update(ok=False, stage="viva", error=(st or {}).get("error"))
            break
        if status in ("scoring", "done") or any(e.get("speaker") == "moderator" and "end of the viva" in e.get("message", "").lower() for e in events):
            break
        if status == "awaiting" and events and events[-1].get("speaker") in EXAMINERS and not events[-1].get("tool_used"):
            answer = ANSWERS[answered % len(ANSWERS)]
            c, r = call(base, "POST", "/answer", {"session_id": sid, "answer": answer, "seconds": 20})
            if c == 200:
                answered += 1
                # wait for the student echo so the same question isn't answered twice
                for _ in range(20):
                    more = events_since(base, sid, seq, wait_s=2)
                    for s, e in more:
                        seq = max(seq, s)
                        events.append(e)
                    if any(e.get("speaker") == "student" for _, e in more):
                        break
        time.sleep(1)
    rec["events"] = events
    questions = [e for e in events if e.get("speaker") in EXAMINERS and not e.get("tool_used")]
    tools = [e for e in events if e.get("tool_used")]
    rec["questions"] = len(questions)
    rec["questions_with_file"] = sum(1 for q in questions if q.get("file_ref"))
    rec["cross_challenges"] = sum(1 for q in questions if q.get("message", "").lower().startswith(("i'd push back", "to build on")))
    rec["tool_calls"] = [{"tool": e["tool_used"], "speaker": e["speaker"], "message": e["message"][:200]} for e in tools]
    runs = [e for e in tools if e.get("tool_used") == "run_tests" and e.get("speaker") == "system"]
    rec["sandbox"] = runs[-1]["message"][:200] if runs else None
    rec["seconds"] = round(time.time() - started)
    if rec.get("ok") is False:
        return rec
    if invite:
        rec["ok"] = True  # the screening report is fetched by the caller with the recruiter key
        return rec
    for _ in range(60):  # scoring takes a few seconds
        c, rep = call(base, "GET", f"/report/{sid}")
        if c == 200:
            rec.update(ok=True, report=rep, score=rep.get("overall_score"), readiness=rep.get("readiness"))
            break
        if c not in (202, 409):
            rec.update(ok=False, stage="report", error=f"{c} {rep}")
            break
        time.sleep(3)
    else:
        rec.update(ok=False, stage="report", error="report not ready after 3 minutes")
    return rec


def save(rec: dict, name: str) -> Path:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    p = EVIDENCE / f"live-{dt.date.today().isoformat()}-{name}.json"
    p.write_text(json.dumps(rec, indent=2, ensure_ascii=False))
    return p


def row(i: int, rec: dict) -> str:
    repo = (rec.get("repo") or "").replace("https://github.com/", "")
    if not rec.get("ok"):
        return f"| {i} | {repo} | | | | ❌ | Failed at {rec.get('stage')}: {str(rec.get('error'))[:120]} |"
    files = f"{rec['questions_with_file']}/{rec['questions']} cite a file"
    sandbox = rec["sandbox"] or "not triggered"
    return (f"| {i} | {repo} | {rec['questions']} questions, {rec['cross_challenges']} cross-challenge(s) | {files} | "
            f"{sandbox} | ✅ {rec.get('score')}/100 | {rec['seconds']} s |")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--repos", nargs="+", default=DEFAULT_REPOS)
    ap.add_argument("--only", choices=["health", "repos", "hiring"])
    ap.add_argument("--resume", nargs="*", default=[], metavar="REPO=SESSION_ID",
                    help="continue vivas a broken run already started, instead of starting new ones")
    a = ap.parse_args()
    base = a.base.rstrip("/")
    resumes = dict(r.split("=", 1) for r in a.resume)

    print(f"Viva Panel live check against {base}\n")
    code, h = call(base, "GET", "/health", timeout=120)  # the first call may wake a sleeping free instance
    print("health:", code, json.dumps(h))
    if code != 200:
        return 1
    sb = (h or {}).get("sandbox", {})
    print(f"  storage: {h.get('storage')}   sandbox: {sb.get('backend')}   {sb.get('problem') or ''}\n")
    if a.only == "health":
        return 0

    if a.only in (None, "repos"):
        rows, ok = [], 0
        for i, repo in enumerate(a.repos, 1):
            print(f"[{i}/{len(a.repos)}] {repo} …", flush=True)
            rec = viva(base, repo, resume=resumes.get(repo))
            path = save(rec, repo.rstrip("/").split("/")[-1])
            ok += bool(rec.get("ok"))
            rows.append(row(i, rec))
            print("   ", rows[-1], f"\n    evidence: {path.relative_to(EVIDENCE.parents[1])}", flush=True)
        print("\nPaste into docs/test-case-proof.md (Real-repo runs):\n")
        print("| # | Repo | Panel | Questions cite real files? | Sandbox | Report | Time |")
        print("|---|---|---|---|---|---|---|")
        print("\n".join(rows))
        print(f"\nResult: {ok} of {len(a.repos)} ran end to end.")

    if a.only in (None, "hiring"):
        print("\nHiring mode: creating an interview link …")
        code, inv = call(base, "POST", "/invites", {"title": "Backend developer intern", "company": "Viva Panel test",
                                                    "focus": ["backend", "REST APIs", "testing"]})
        if code != 200:
            print("   could not create an invite:", code, inv)
            return 1
        rec = viva(base, a.repos[0], invite=inv["token"])
        rec["screening"] = None
        for _ in range(60):
            c, scr = call(base, "GET", f"/screening/{inv['token']}?key={inv['key']}")
            if c == 200 and scr and scr.get("report"):
                rec["screening"] = scr
                break
            time.sleep(3)
        blocked, _ = call(base, "GET", f"/report/{rec.get('session_id')}")
        rec["candidate_cannot_open_report"] = blocked == 403
        path = save(rec, "hiring")
        rep = (rec["screening"] or {}).get("report") or {}
        skills = ", ".join(f"{s['skill']} {s['score']}" for s in rep.get("skills", [])) or "—"
        print(f"   viva: {'ok' if rec.get('ok') else 'FAILED ' + str(rec.get('error'))}; questions {rec.get('questions')}")
        print(f"   recruiter report: {'yes' if rep else 'NO'}; score {rep.get('overall_score')}; skills: {skills}")
        print(f"   candidate blocked from the recruiter report: {rec['candidate_cannot_open_report']}")
        print(f"   evidence: {path.relative_to(EVIDENCE.parents[1])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
