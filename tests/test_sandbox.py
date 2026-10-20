"""The test sandbox: reading pytest's output, guarding test paths, and choosing a backend."""
from pathlib import Path

import pytest

from backend.app import sandbox

FAILED_RUN = """........F..
=========================== short test summary info ============================
FAILED tests/test_fines.py::test_early_return_has_no_fine - assert -10 == 0
1 failed, 10 passed, 2 skipped in 0.42s
"""


def test_parse_failed_run():
    r = sandbox.parse_pytest(FAILED_RUN, 1, "pytest -q", 1.0)
    assert (r.status, r.passed, r.failed, r.skipped, r.duration_s) == ("failed", 10, 1, 2, 0.42)
    assert r.failing_tests == ["tests/test_fines.py::test_early_return_has_no_fine"]


def test_parse_passed_errors_and_timeouts():
    assert sandbox.parse_pytest("12 passed in 0.02s", 0, "pytest -q", 1).status == "passed"
    collection = "ERROR tests/test_x.py\n1 error in 0.10s"
    r = sandbox.parse_pytest(collection, 2, "pytest -q", 1)
    assert r.status == "error" and r.errors == 1 and r.failing_tests == ["tests/test_x.py"]
    assert sandbox.parse_pytest("no tests ran in 0.01s", 5, "pytest -q", 1).status == "error"
    t = sandbox.parse_pytest("", 124, "pytest -q", 61.2)
    assert t.status == "timeout" and t.duration_s == 61.2


class FakeBox(sandbox.Sandbox):
    """Records what would run, without Docker."""
    def __init__(self, *a):
        super().__init__(*a)
        self.ran = []

    def _create(self): pass
    def _exec(self, script, timeout): pass
    def _offline(self): pass

    def _run_tests(self, args):
        self.ran.append(args)
        return "3 passed in 0.01s", 0


def test_only_real_test_files_can_be_targeted(tmp_path):
    box = FakeBox(tmp_path, ["tests/test_a.py", "app/main.py", "tests/conftest.py"])
    assert box.run("tests/test_a.py").command == "pytest -q tests/test_a.py"
    for bad in ["app/main.py", "../../etc/passwd", "tests/test_a.py; rm -rf /", None]:
        assert box.run(bad).command == "pytest -q"
    assert all(a[0] == "timeout" for a in box.ran)  # every run has a hard time limit


def test_a_failed_install_reports_an_error_instead_of_running(tmp_path):
    class Broken(FakeBox):
        def _exec(self, script, timeout):
            raise RuntimeError("pip failed")
    box = Broken(tmp_path, ["tests/test_a.py"])
    r = box.run("tests/test_a.py")
    assert r.status == "error" and "pip failed" in r.output_tail and box.ran == []


@pytest.mark.parametrize("env, docker_ok, expected", [
    ({"VIVA_SANDBOX": "off", "E2B_API_KEY": "k"}, True, None),
    ({"E2B_API_KEY": "k"}, True, "e2b"),
    ({}, True, "docker"),
    ({}, False, None),
    ({"VIVA_SANDBOX": "docker", "E2B_API_KEY": "k"}, True, "docker"),
])
def test_backend_choice(monkeypatch, env, docker_ok, expected):
    monkeypatch.delenv("VIVA_SANDBOX", raising=False)
    monkeypatch.delenv("E2B_API_KEY", raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setattr(sandbox, "_docker_ok", docker_ok)
    assert sandbox.backend() == expected


def test_no_sandbox_without_python_tests(tmp_path, monkeypatch):
    monkeypatch.setattr(sandbox, "backend", lambda: "docker")
    assert sandbox.make(tmp_path, [], None) is None
    assert sandbox.make(Path("/no/such/clone"), [], "pytest -q") is None
    assert isinstance(sandbox.make(tmp_path, [], "pytest -q"), sandbox.DockerSandbox)
