"""Team projects: who wrote what comes from git history, and the panel examines the student on their own files."""
import subprocess

import pytest

from agents import llm
from agents.moderator import Moderator
from agents.schemas import FileOwnership, PanelPlan, PlannedTopic, StudentWork
from backend.app import authorship


def git(repo, *args, author=None):
    env = {"GIT_AUTHOR_NAME": author[0], "GIT_AUTHOR_EMAIL": author[1], "GIT_COMMITTER_NAME": author[0],
           "GIT_COMMITTER_EMAIL": author[1], "HOME": str(repo), "PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"} if author else None
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, env=env)


@pytest.fixture
def team_repo(tmp_path):
    asha, ravi = ("Asha K", "asha@example.com"), ("Ravi", "1234+ravi-dev@users.noreply.github.com")
    git(tmp_path, "init", "-q")
    for author, path, n in [(asha, "app/auth.py", 3), (ravi, "app/db.py", 2), (ravi, "app/auth.py", 1), (asha, "README.md", 1)]:
        for i in range(n):
            f = tmp_path / path
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(f"{path} v{i} by {author[0]}\n" + (f.read_text() if f.exists() else ""))
            git(tmp_path, "add", "-A", author=author)
            git(tmp_path, "commit", "-q", "-m", f"{path} {i}", author=author)
    (tmp_path / "old.py").write_text("x")  # never committed: not in history
    return tmp_path


def test_git_log_and_ownership(team_repo):
    commits = authorship.git_log(team_repo)
    assert len(commits) == 7
    files = ["app/auth.py", "app/db.py", "README.md"]
    asha = authorship.analyse(commits, "asha-k", set(), {"asha@example.com"}, {"asha k"}, files, ["ravi-dev"])
    assert (asha.commits, asha.team_commits) == (4, 7)
    own = {f.path: (f.by_student, f.total, f.owned) for f in asha.files}
    assert own["app/auth.py"] == (3, 4, True)
    assert "app/db.py" not in own
    assert asha.focus()[0] == "app/auth.py"


def test_noreply_email_matches_the_login(team_repo):
    ravi = authorship.analyse(authorship.git_log(team_repo), "ravi-dev", set(), set(), set(),
                              ["app/auth.py", "app/db.py"], [])
    own = {f.path: f.owned for f in ravi.files}
    assert ravi.commits == 3 and own == {"app/db.py": True, "app/auth.py": False}


def test_unknown_student_has_no_work(team_repo):
    assert authorship.analyse(authorship.git_log(team_repo), "nobody", set(), set(), set(), ["app/auth.py"], []) is None


def test_focus_falls_back_to_touched_files():
    w = StudentWork(login="x", commits=1, team_commits=10,
                    files=[FileOwnership(path="a.py", by_student=1, total=5), FileOwnership(path="b.py", by_student=1, total=9)])
    assert w.focus() == ["a.py", "b.py"]


@pytest.mark.parametrize("login, ok", [("ravi-dev", True), ("A1", True), ("-bad", False), ("a" * 40, False), ("x/y", False)])
def test_login_validation(login, ok):
    assert bool(authorship.LOGIN.match(login)) == ok


def team_summary(summary, focus):
    files = [FileOwnership(path=p, by_student=5, total=6) for p in focus]
    return summary.model_copy(update={"student": StudentWork(login="asha", commits=30, team_commits=60, files=files)})


def test_plan_puts_at_least_half_the_topics_on_the_students_files(summary, monkeypatch):
    """The model plans every topic on a teammate's file; code re-anchors enough of them to the student's."""
    team = team_summary(summary, ["app/routes/loans.py", "app/services/fines.py"])
    others = [("professor", "app/db.py"), ("professor", "app/auth.py:hash_password"), ("engineer", "app/routes/books.py"),
              ("engineer", "app/auth.py:create_token"), ("junior", "app/db.py:init_db"), ("junior", "app/main.py")]
    plan = PanelPlan(topics=[PlannedTopic(examiner=e, title=f"t{i}", file_ref=f, why="w") for i, (e, f) in enumerate(others)])
    monkeypatch.setattr(llm, "is_offline", lambda: False)
    monkeypatch.setattr(llm, "structured_call", lambda *a, **k: plan)
    topics = Moderator(team).plan().topics
    on_mine = [t for t in topics if t.file_ref.split(":")[0] in {"app/routes/loans.py", "app/services/fines.py"}]
    assert len(on_mine) == 2  # all of the student's key files are now examined (half would be 3; only 2 exist)
    assert all(t.why.startswith("Code the student wrote") for t in on_mine)
    assert {t.examiner for t in topics} == {"professor", "engineer", "junior"}


def test_offline_plan_and_welcome_lead_with_the_students_files(summary):
    team = team_summary(summary, ["app/services/fines.py"])
    mod = Moderator(team)
    plan = mod.plan()
    assert plan.topics[0].file_ref.startswith("app/services/fines.py")
    message, _ = mod.plan_announcement(plan)
    assert "team project" in message and "30 of the 60 commits" in message


def test_report_marks_own_work(summary):
    from agents.panel import Panel
    from agents.scoring import build_report
    team = team_summary(summary, ["app/services/fines.py"])
    panel = Panel(team)
    list(panel.start())
    while panel.awaiting_answer:
        list(panel.answer("It works."))
    report = build_report(team, panel.state)
    assert report.student.login == "asha"
    flags = {t.file_ref.split(":")[0]: t.own_work for t in report.topics if t.file_ref}
    assert flags["app/services/fines.py"] is True and False in flags.values()
