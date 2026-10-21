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
    ({"DAYTONA_API_KEY": "k"}, False, "daytona"),
    ({"DAYTONA_API_KEY": "k", "E2B_API_KEY": "k"}, False, "e2b"),
    ({"VIVA_SANDBOX": "daytona", "DAYTONA_API_KEY": "k", "E2B_API_KEY": "k"}, False, "daytona"),
])
def test_backend_choice(monkeypatch, env, docker_ok, expected):
    monkeypatch.delenv("VIVA_SANDBOX", raising=False)
    monkeypatch.delenv("E2B_API_KEY", raising=False)
    monkeypatch.delenv("DAYTONA_API_KEY", raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setattr(sandbox, "_docker_ok", docker_ok)
    assert sandbox.backend() == expected


def test_no_sandbox_without_python_tests(tmp_path, monkeypatch):
    monkeypatch.setattr(sandbox, "backend", lambda: "docker")
    assert sandbox.make(tmp_path, [], None) is None
    assert sandbox.make(Path("/no/such/clone"), [], "pytest -q") is None
    assert isinstance(sandbox.make(tmp_path, [], "pytest -q"), sandbox.DockerSandbox)


def test_install_falls_back_to_virtualenv_when_venv_is_missing():
    # E2B's default image can lack python3-venv; the install script must not depend on it alone
    script = sandbox.INSTALL.format(venv="/v", work="/w")
    assert "python3 -m venv /v" in script and "virtualenv" in script


def test_status_explains_a_missing_backend(monkeypatch):
    monkeypatch.setenv("VIVA_SANDBOX", "off")
    s = sandbox.status()
    assert s["backend"] == "off" and "problem" in s


def test_daytona_backend_full_flow(tmp_path, monkeypatch):
    """The Daytona adapter against a fake SDK: create, upload, install, cut the network, run pytest, delete."""
    import sys
    import types

    calls = []

    class Resp:
        def __init__(self, code=0, out=""):
            self.exit_code, self.result = code, out

    class Box:
        def __init__(self):
            self.fs = types.SimpleNamespace(upload_file=lambda data, dst: calls.append(("upload", dst, len(data))))
            self.process = types.SimpleNamespace(exec=self.exec)

        def get_user_home_dir(self):
            return "/home/daytona"

        def exec(self, cmd, cwd=None, env=None, timeout=None):
            calls.append(("exec", cmd, cwd))
            if "pytest" in cmd and cwd:
                return Resp(1, "FAILED tests/test_a.py::test_x - assert 1 == 2\n1 failed, 2 passed in 0.31s")
            return Resp(0, "")

        def update_network_settings(self, **kw):
            calls.append(("network", kw))

    class Client:
        def __init__(self, cfg):
            calls.append(("client", cfg.api_key))

        def create(self, params, timeout=60):
            calls.append(("create", params.language, params.ephemeral))
            return Box()

        def delete(self, box):
            calls.append(("delete",))

    fake = types.ModuleType("daytona")
    fake.Daytona = Client
    fake.DaytonaConfig = lambda api_key=None, api_url=None: types.SimpleNamespace(api_key=api_key)
    fake.CreateSandboxFromSnapshotParams = lambda **kw: types.SimpleNamespace(**kw)
    monkeypatch.setitem(sys.modules, "daytona", fake)
    monkeypatch.setenv("DAYTONA_API_KEY", "test-key")

    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_a.py").write_text("def test_x():\n    assert 1 == 2\n")
    box = sandbox.DaytonaSandbox(tmp_path, ["tests/test_a.py"])
    r = box.run("tests/test_a.py")
    box.close()

    assert r.status == "failed" and r.failed == 1 and r.passed == 2
    assert r.failing_tests == ["tests/test_a.py::test_x"]
    kinds = [c[0] for c in calls]
    assert kinds[:3] == ["client", "create", "upload"]
    assert ("network", {"network_block_all": True}) in calls
    # the network is cut before any test runs, and the sandbox is deleted at the end
    assert kinds.index("network") < max(i for i, c in enumerate(calls) if c[0] == "exec" and c[2])
    assert kinds[-1] == "delete"
    assert box.work == "/home/daytona/work"
