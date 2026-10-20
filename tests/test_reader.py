"""The agentic repo reader: the model explores and picks key files; code validates every pick."""
from agents import llm
from backend.app import ingest
from backend.app.ingest import SummaryDraft, _FileDraft


def make_repo(tmp_path):
    files = {
        "app/core.py": "def transfer(a, b, amount):\n    return a - amount, b + amount\n\nclass Ledger:\n    pass\n",
        "app/views.py": "def index():\n    return 'hi'\n",
        "app/util.py": "def helper():\n    return 1\n",
        "tests/test_core.py": "def test_transfer():\n    assert True\n",
        "README.md": "# Bank\nTransfers are atomic.\n",
    }
    for path, text in files.items():
        (tmp_path / path).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / path).write_text(text)
    return sorted(files)


def draft(*key_files):
    return SummaryDraft(one_liner="A bank.", tech_stack=["Python"], readme_claims=["Transfers are atomic."],
                        key_files=[_FileDraft(path=p, purpose="p", functions=f) for p, f in key_files])


def fake_loop(result, calls=()):
    def loop(system, user, tools, execute, final, max_tool_calls=3, fast=False):
        for name, args in calls:
            yield llm.ToolCall(name, args)
            yield llm.ToolCall(name, args, execute(name, args))
        return result
    return loop


def test_reader_picks_are_validated(tmp_path, monkeypatch):
    files = make_repo(tmp_path)
    monkeypatch.setattr(llm, "is_offline", lambda: False)
    monkeypatch.setattr(llm, "agent_loop", fake_loop(draft(
        ("app/core.py", ["transfer", "made_up_fn"]),    # a function that doesn't exist
        ("app/invented.py", ["x"]),                      # a path that doesn't exist
        ("tests/test_core.py", ["test_transfer"]),       # tests aren't key files
        ("README.md", []),                               # not code
        ("app/core.py", ["Ledger"]),                     # duplicate
        ("app/views.py", ["index"]),
    )))
    s = ingest.summarise("o", "bank", tmp_path, files, ["app/core.py"], {}, candidates=["app/core.py", "app/views.py"])
    assert [(k.path, k.functions) for k in s.key_files] == [("app/core.py", ["transfer"]), ("app/views.py", ["index"])]
    assert "def transfer" in s.key_files[0].snippet  # snippet cut from the real file


def test_exploration_is_narrated_once_per_step(tmp_path, monkeypatch):
    files = make_repo(tmp_path)
    steps = [("read_file", {"path": "app/core.py", "why": "core logic"}), ("search_code", {"query": "atomic", "why": "README claim"}),
             ("read_file", {"path": "app/core.py", "why": "again after a provider fallback"})]
    monkeypatch.setattr(llm, "is_offline", lambda: False)
    monkeypatch.setattr(llm, "agent_loop", fake_loop(draft(("app/core.py", ["transfer"])), steps))
    said = []
    ingest.summarise("o", "bank", tmp_path, files, ["app/core.py"], {}, progress=said.append, candidates=["app/core.py"])
    assert said == ["Opening app/core.py… core logic", "Searching the code for “atomic”… README claim"]


def test_students_files_are_always_key_files(tmp_path, monkeypatch):
    files = make_repo(tmp_path)
    monkeypatch.setattr(llm, "is_offline", lambda: False)
    monkeypatch.setattr(llm, "agent_loop", fake_loop(draft(("app/views.py", ["index"]))))
    s = ingest.summarise("o", "bank", tmp_path, files, [], {}, candidates=["app/views.py", "app/util.py"],
                         must_include=["app/util.py"])
    assert s.key_files[0].path == "app/util.py" and s.key_files[0].functions == ["helper"]


def test_falls_back_to_one_summary_call_when_the_agent_fails(tmp_path, monkeypatch):
    files = make_repo(tmp_path)

    def broken(*a, **k):
        raise llm.LLMError("tool loop broke")
        yield

    monkeypatch.setattr(llm, "is_offline", lambda: False)
    monkeypatch.setattr(llm, "agent_loop", broken)
    monkeypatch.setattr(llm, "structured_call", lambda *a, **k: draft(("app/core.py", ["Ledger"])))
    s = ingest.summarise("o", "bank", tmp_path, files, ["app/core.py"], {}, candidates=["app/core.py"])
    assert [k.path for k in s.key_files] == ["app/core.py"]


def test_names_in_finds_definitions():
    code = "import x\n\nclass Bank:\n    def __init__(self):\n        pass\n    async def pay(self):\n        pass\nconst load = async (u) => u\n"
    assert ingest.names_in(code) == ["Bank", "pay", "load"]
