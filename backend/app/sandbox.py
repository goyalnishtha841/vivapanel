"""Sandbox: run a student's own tests safely, so the Engineer can check claims like "my tests cover that".

Running a stranger's code on our server is the risk, so it never runs here. Each session gets an isolated box
that is thrown away afterwards:

1. create the box (Docker container, or an E2B microVM when hosted), with limits on memory, CPU and processes
2. copy in the repo (the clone on our side is never touched)
3. install pytest and the project's dependencies, the only step with internet access
4. cut the network
5. run tests on demand, each with a hard timeout; none of our keys or files are ever inside

Backends: VIVA_SANDBOX=docker | e2b | daytona | off (default: e2b when E2B_API_KEY is set, else daytona when
DAYTONA_API_KEY is set, else docker if it's running, else off, in which case real repos simply aren't test-run).
Python and pytest only for now.
"""
from __future__ import annotations

import io
import os
import re
import shlex
import shutil
import subprocess
import tarfile
import threading
import time
import uuid
from pathlib import Path

from agents.moderator import is_test_file
from agents.schemas import RunTestsResult

INSTALL_TIMEOUT_S = int(os.getenv("VIVA_SANDBOX_INSTALL_S", "240"))
TEST_TIMEOUT_S = int(os.getenv("VIVA_SANDBOX_TEST_S", "60"))
LIFETIME_S = 1800  # the box removes itself after this even if nobody calls close()
IMAGE = os.getenv("VIVA_SANDBOX_IMAGE", "python:3.12-slim")
SKIP = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".tox", ".mypy_cache"}
MAX_UPLOAD_BYTES = 40_000_000

# Pin Python 3.12 with uv when the box has it: Daytona's default image runs 3.14, where common pinned packages
# (pandas 2.2, say) have no wheels, so pip compiles them from source and the 1 GB box is killed out of memory.
# Some images (E2B's default one included) ship python3 without the venv module ("ensurepip is not available"),
# so fall back to virtualenv from PyPI before giving up.
PYTHON = os.getenv("VIVA_SANDBOX_PYTHON", "3.12")
INSTALL = (
    "set -e; "
    "((command -v uv >/dev/null && uv venv -q --seed -p " + PYTHON + " {venv}) || python3 -m venv {venv} 2>/dev/null || "
    " (python3 -m pip install -q --user --disable-pip-version-check virtualenv && python3 -m virtualenv -q {venv})) && "
    ". {venv}/bin/activate && cd {work} && "
    "pip install -q --disable-pip-version-check pytest && "
    "if [ -f requirements.txt ]; then pip install -q -r requirements.txt; fi && "
    "if [ -f requirements-dev.txt ]; then pip install -q -r requirements-dev.txt || true; fi && "
    "if [ -f pyproject.toml ] || [ -f setup.py ]; then pip install -q -e . || true; fi"
)


# ---------- reading pytest's output ----------

COUNT = re.compile(r"(\d+) (passed|failed|errors?|skipped|xfailed|xpassed|deselected)")
FAILED = re.compile(r"^(?:FAILED|ERROR) (\S+)", re.M)
DURATION = re.compile(r" in ([\d.]+)s")


def parse_pytest(output: str, exit_code: int, command: str, elapsed: float) -> RunTestsResult:
    counts = {"passed": 0, "failed": 0, "errors": 0, "skipped": 0}
    summary = next((line for line in reversed(output.splitlines()) if COUNT.search(line) or "no tests ran" in line), "")
    for n, kind in COUNT.findall(summary):
        key = "errors" if kind.startswith("error") else kind
        if key in counts:
            counts[key] += int(n)
    d = DURATION.search(summary)
    if exit_code == 124:
        status = "timeout"
    elif exit_code == 0:
        status = "passed"
    elif exit_code == 1 and (counts["failed"] or counts["errors"]):
        status = "failed"
    else:
        status = "error"  # collection error, no tests, crash
    return RunTestsResult(
        status=status, command=command, passed=counts["passed"], failed=counts["failed"], errors=counts["errors"],
        skipped=counts["skipped"], duration_s=float(d.group(1)) if d else round(elapsed, 1),
        failing_tests=FAILED.findall(output)[:10], output_tail="\n".join(output.strip().splitlines()[-15:]),
    )


# ---------- the box ----------

class Sandbox:
    """One per session. prepare() runs in the background as soon as the repo is read, so the first test run is fast."""
    work = "/work"
    venv = "/opt/venv"

    def __init__(self, root: Path, files: list[str]):
        self.root = Path(root)
        self.tests = {f for f in files if is_test_file(f) and f.endswith(".py")}
        self._ready = threading.Event()
        self._lock = threading.Lock()
        self._started = False
        self.error: str | None = None

    def start(self) -> None:
        with self._lock:
            if self._started:
                return
            self._started = True
        threading.Thread(target=self._prepare, daemon=True, name="sandbox-prepare").start()

    def _prepare(self) -> None:
        try:
            self._create()
            self._exec(INSTALL.format(venv=self.venv, work=self.work), INSTALL_TIMEOUT_S + 30)
            self._offline()
        except Exception as e:  # noqa: BLE001 - any failure just means tests can't run this session
            global LAST_ERROR
            self.error = f"{type(e).__name__}: {str(e)[:300]}"
            if "Killed" in str(e):
                self.error += " (the box ran out of memory installing the project's dependencies)"
            LAST_ERROR = f"{type(self).__name__}: {self.error}"
            print(f"sandbox prepare failed: {self.error}", flush=True)
        finally:
            self._ready.set()

    def env(self) -> dict[str, str]:
        # if the project couldn't be pip-installed (e.g. needs a C compiler), import it straight from the copy
        return {"PYTHONPATH": f"{self.work}/src:{self.work}", "PYTHONDONTWRITEBYTECODE": "1"}

    def run(self, test_path: str | None) -> RunTestsResult:
        if test_path not in self.tests:
            test_path = None  # only real test files; anything else runs the whole suite
        command = "pytest -q" + (f" {test_path}" if test_path else "")
        self.start()
        if not self._ready.wait(INSTALL_TIMEOUT_S + 60) or self.error:
            return RunTestsResult(status="error", command=command,
                                  output_tail=f"The sandbox couldn't install this project: {self.error or 'timed out'}")
        args = ["timeout", str(TEST_TIMEOUT_S), f"{self.venv}/bin/python", "-m", "pytest", "-q", "-rfE",
                "--tb=line", "--color=no", "-p", "no:cacheprovider"] + ([test_path] if test_path else [])
        started = time.time()
        try:
            out, code = self._run_tests(args)
        except Exception as e:  # noqa: BLE001
            return RunTestsResult(status="error", command=command, output_tail=f"{type(e).__name__}: {str(e)[:300]}")
        return parse_pytest(out, code, command, time.time() - started)

    def close(self) -> None:
        pass

    # backend hooks
    def _create(self) -> None: ...
    def _exec(self, script: str, timeout: int) -> None: ...
    def _offline(self) -> None: ...
    def _run_tests(self, args: list[str]) -> tuple[str, int]: ...


def _tarball(root: Path) -> bytes:
    buf = io.BytesIO()
    total = 0
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for p in sorted(root.rglob("*")):
            rel = p.relative_to(root)
            if any(part in SKIP for part in rel.parts) or not p.is_file() or p.is_symlink():
                continue
            total += p.stat().st_size
            if total > MAX_UPLOAD_BYTES:
                break
            tar.add(p, arcname=rel.as_posix())
    return buf.getvalue()


class DockerSandbox(Sandbox):
    """A throwaway container: memory, CPU and process limits, no capabilities, network cut after installing."""

    def __init__(self, root: Path, files: list[str]):
        super().__init__(root, files)
        self.name = f"viva-sbx-{uuid.uuid4().hex[:10]}"

    def _docker(self, *args: str, timeout: int = 60, check: bool = True) -> subprocess.CompletedProcess:
        return subprocess.run(["docker", *args], capture_output=True, text=True, timeout=timeout, check=check)

    def _create(self) -> None:
        self._docker("run", "-d", "--rm", "--name", self.name, "--memory", "768m", "--cpus", "1", "--pids-limit", "256",
                     "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "-e", "PIP_NO_CACHE_DIR=1",
                     IMAGE, "sleep", str(LIFETIME_S), timeout=180)
        self._docker("exec", self.name, "mkdir", "-p", self.work)
        self._docker("cp", f"{self.root}/.", f"{self.name}:{self.work}", timeout=120)

    def _exec(self, script: str, timeout: int) -> None:
        r = self._docker("exec", self.name, "sh", "-c", script, timeout=timeout, check=False)
        if r.returncode:
            raise RuntimeError((r.stderr or r.stdout).strip()[-300:])

    def _offline(self) -> None:
        self._docker("network", "disconnect", "bridge", self.name)

    def _run_tests(self, args: list[str]) -> tuple[str, int]:
        envs = [x for k, v in self.env().items() for x in ("-e", f"{k}={v}")]
        r = self._docker("exec", "-w", self.work, *envs, self.name, *args, timeout=TEST_TIMEOUT_S + 20, check=False)
        return r.stdout + r.stderr, r.returncode

    def close(self) -> None:
        subprocess.run(["docker", "rm", "-f", self.name], capture_output=True, timeout=30)


class E2BSandbox(Sandbox):
    """A hosted microVM (e2b.dev), for hosts that can't run Docker. Internet is switched off after installing."""
    work = "/home/user/work"
    venv = "/home/user/venv"

    def __init__(self, root: Path, files: list[str]):
        super().__init__(root, files)
        self.box = None

    def _create(self) -> None:
        from e2b import Sandbox as Box

        self.box = Box.create(timeout=LIFETIME_S, allow_internet_access=True)
        self.box.files.write("/tmp/repo.tgz", _tarball(self.root))
        self.box.commands.run(f"mkdir -p {self.work} && tar xzf /tmp/repo.tgz -C {self.work}", timeout=120)

    def _exec(self, script: str, timeout: int) -> None:
        self.box.commands.run(script, timeout=timeout)  # raises on a non-zero exit

    def _offline(self) -> None:
        self.box.update_network({"allow_internet_access": False})

    def _run_tests(self, args: list[str]) -> tuple[str, int]:
        from e2b import CommandExitException

        try:
            r = self.box.commands.run(shlex.join(args), cwd=self.work, envs=self.env(),  # repo file names are untrusted
                                      timeout=TEST_TIMEOUT_S + 20)
            return r.stdout + r.stderr, r.exit_code
        except CommandExitException as e:
            return e.stdout + e.stderr, e.exit_code

    def close(self) -> None:
        if self.box is not None:
            try:
                self.box.kill()
            except Exception:  # noqa: BLE001
                pass


class DaytonaSandbox(Sandbox):
    """A hosted sandbox from daytona.io (free credits, no card), for hosts that can't run Docker.

    Same steps as the others: create, upload the repo, install, cut the network, run tests on demand. The sandbox is
    ephemeral and stops (and so deletes itself) after 30 idle minutes even if close() is never called.
    """

    def __init__(self, root: Path, files: list[str]):
        super().__init__(root, files)
        self.client = None
        self.box = None
        self.network_note: str | None = None

    def _create(self) -> None:
        from daytona import CreateSandboxFromSnapshotParams, Daytona, DaytonaConfig

        self.client = Daytona(DaytonaConfig(api_key=os.environ["DAYTONA_API_KEY"],
                                            api_url=os.getenv("DAYTONA_API_URL") or None))
        self.box = self.client.create(
            CreateSandboxFromSnapshotParams(language="python", ephemeral=True, auto_stop_interval=LIFETIME_S // 60,
                                            labels={"app": "viva-panel"}),
            timeout=120)
        home = self.box.get_user_home_dir().rstrip("/")
        self.work, self.venv = f"{home}/work", f"{home}/venv"
        self.box.fs.upload_file(_tarball(self.root), "/tmp/repo.tgz")
        self._exec(f"mkdir -p {self.work} && tar xzf /tmp/repo.tgz -C {self.work}", 120)

    def _exec(self, script: str, timeout: int) -> None:
        r = self.box.process.exec(f"sh -c {shlex.quote(script)}", timeout=timeout)
        if r.exit_code:
            raise RuntimeError((r.result or "").strip()[-300:] or f"exit code {r.exit_code}")

    def _offline(self) -> None:
        try:
            self.box.update_network_settings(network_block_all=True)
        except Exception as e:  # noqa: BLE001
            # Daytona's lower tiers already restrict outbound traffic to package registries and may not allow
            # changing the policy; tests still run, and the report notes it instead of failing the whole check.
            self.network_note = f"network policy unchanged ({type(e).__name__}); Daytona's tier restrictions apply"
            print(f"sandbox: {self.network_note}", flush=True)

    def _run_tests(self, args: list[str]) -> tuple[str, int]:
        try:
            r = self.box.process.exec(shlex.join(args), cwd=self.work, env=self.env(), timeout=TEST_TIMEOUT_S + 20)
            return r.result or "", int(r.exit_code)
        except Exception as e:  # noqa: BLE001
            if "timeout" in type(e).__name__.lower() or "timed out" in str(e).lower():
                return f"timed out after {TEST_TIMEOUT_S}s", 124
            raise

    def close(self) -> None:
        if self.client is not None and self.box is not None:
            try:
                self.client.delete(self.box)
            except Exception:  # noqa: BLE001
                pass


# ---------- choosing a backend ----------

_docker_ok: bool | None = None


def backend() -> str | None:
    global _docker_ok
    choice = os.getenv("VIVA_SANDBOX", "auto").lower()
    if choice == "off":
        return None
    if choice in ("e2b", "auto") and os.getenv("E2B_API_KEY"):
        return "e2b"
    if choice in ("daytona", "auto") and os.getenv("DAYTONA_API_KEY"):
        return "daytona"
    if choice in ("docker", "auto"):
        if _docker_ok is None:
            try:
                _docker_ok = shutil.which("docker") is not None and subprocess.run(
                    ["docker", "info"], capture_output=True, timeout=10).returncode == 0
            except (OSError, subprocess.SubprocessError):
                _docker_ok = False
        return "docker" if _docker_ok else None
    return None


def status() -> dict:
    """What the sandbox would use right now, for /health: lets you check a deploy without reading logs."""
    kind = backend()
    info: dict = {"backend": kind or "off", "image": IMAGE if kind == "docker" else None}
    forced = os.getenv("VIVA_SANDBOX", "auto").lower()
    if forced == "e2b" and not os.getenv("E2B_API_KEY"):
        info["problem"] = "VIVA_SANDBOX=e2b but E2B_API_KEY is not set"
    elif forced == "daytona" and not os.getenv("DAYTONA_API_KEY"):
        info["problem"] = "VIVA_SANDBOX=daytona but DAYTONA_API_KEY is not set"
    elif kind is None:
        info["problem"] = ("no sandbox: set DAYTONA_API_KEY (free, no card) or E2B_API_KEY on hosts without Docker "
                           "such as Render, or run Docker")
    elif kind in ("e2b", "daytona"):
        try:
            __import__(kind)
        except ImportError:
            info["problem"] = f"{kind.upper()}_API_KEY is set but the {kind} package is not installed (pip install {kind})"
    if LAST_ERROR:
        info["last_error"] = LAST_ERROR
    return info


LAST_ERROR: str | None = None  # the most recent prepare failure, shown on /health


def make(root: Path, files: list[str], test_command: str | None) -> Sandbox | None:
    """A sandbox for this repo, or None if it has no Python tests or no backend is available."""
    if test_command != "pytest -q" or not root.exists():
        return None
    kind = backend()
    return {"docker": DockerSandbox, "e2b": E2BSandbox, "daytona": DaytonaSandbox}[kind](root, files) if kind else None
