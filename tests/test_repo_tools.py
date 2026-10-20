"""Repo access for the Engineer's tools, and GitHub link parsing: student input must not escape the repo."""
import pytest

from agents.tools import LocalRepoTools, mock_repo_tools
from backend.app.ingest import IngestError, parse_repo_url


def test_read_file_with_line_numbers():
    r = mock_repo_tools().read_file("app/auth.py", max_lines=3)
    assert r["content"].startswith("1: ") and r["total_lines"] > 3 and r["truncated"]


@pytest.mark.parametrize("path", ["../../../etc/passwd", "/etc/passwd", "app/../../tools.py", "no/such/file.py"])
def test_read_file_cannot_leave_the_repo(path):
    assert "error" in mock_repo_tools().read_file(path)


def test_symlink_out_of_the_repo_is_refused(tmp_path):
    secret = tmp_path / "secret.txt"
    secret.write_text("top secret")
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "link.txt").symlink_to(secret)
    assert "error" in LocalRepoTools(repo).read_file("link.txt")


def test_search_code_finds_matches_and_skips_vendor_dirs(tmp_path):
    (tmp_path / "app.py").write_text("def borrow_book():\n    pass\n")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "lib.js").write_text("borrow_book")
    r = LocalRepoTools(tmp_path).search_code("BORROW_BOOK")
    assert [(m["path"], m["line"]) for m in r["matches"]] == [("app.py", 1)]
    assert LocalRepoTools(tmp_path).search_code("  ")["error"] == "empty query"


@pytest.mark.parametrize("url, expected", [
    ("https://github.com/pallets/markupsafe", ("pallets", "markupsafe")),
    ("github.com/pallets/markupsafe.git", ("pallets", "markupsafe")),
    ("https://www.github.com/a-b/c.d/", ("a-b", "c.d")),
])
def test_parse_repo_url(url, expected):
    assert parse_repo_url(url) == expected


@pytest.mark.parametrize("url", ["https://gitlab.com/a/b", "github.com/onlyowner", "https://github.com/a/b/tree/main",
                                 "github.com/a/b; rm -rf /", "file:///etc/passwd"])
def test_parse_repo_url_rejects(url):
    with pytest.raises(IngestError):
        parse_repo_url(url)
