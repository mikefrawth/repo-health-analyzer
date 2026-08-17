"""Analysis Scope: what gets dropped, what gets kept, and in what order."""

from app.scope import (
    IGNORED_DIRS,
    JS_SUFFIXES,
    PYTHON_SUFFIXES,
    language_breakdown,
    primary_code_language,
    resolve_analysis_scope,
    take_by_suffix,
    walk_repository,
)


def _touch(root, relpath: str) -> None:
    path = root / relpath
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("x", encoding="utf-8")


def test_walk_skips_ignored_directories(tmp_path):
    _touch(tmp_path, "main.py")
    _touch(tmp_path, "node_modules/left-pad/index.js")
    _touch(tmp_path, ".git/config")
    _touch(tmp_path, "src/__pycache__/main.cpython-312.pyc")
    _touch(tmp_path, "src/app.py")

    found = walk_repository(tmp_path)

    assert sorted(found) == ["main.py", "src/app.py"]


def test_ignore_list_covers_the_usual_noise():
    for expected in ("node_modules", ".git", "dist", "build", "vendor", ".venv"):
        assert expected in IGNORED_DIRS


def test_scope_under_the_cap_is_not_truncated():
    result = resolve_analysis_scope(["a.py", "b.py"], max_files=10)

    assert result.truncated is False
    assert result.total_seen == 2
    assert len(result.files) == 2


def test_scope_over_the_cap_truncates_and_reports_the_true_total():
    paths = [f"file{i}.py" for i in range(50)]

    result = resolve_analysis_scope(paths, max_files=10)

    assert result.truncated is True
    assert len(result.files) == 10
    assert result.total_seen == 50


def test_truncation_keeps_shallow_files_first():
    paths = ["deep/a/b/c/buried.py", "root.py", "src/mid.py"]

    result = resolve_analysis_scope(paths, max_files=2)

    assert result.files == ["root.py", "src/mid.py"]


def test_take_by_suffix_respects_its_own_cap():
    files = [f"m{i}.py" for i in range(20)] + ["index.ts"]

    assert len(take_by_suffix(files, PYTHON_SUFFIXES, cap=5)) == 5
    assert take_by_suffix(files, JS_SUFFIXES, cap=5) == ["index.ts"]


def test_take_by_suffix_is_case_insensitive():
    assert take_by_suffix(["Main.PY"], PYTHON_SUFFIXES, cap=5) == ["Main.PY"]


def test_language_breakdown_counts_by_extension():
    breakdown = language_breakdown(["a.py", "b.py", "c.ts", "README.md"])

    assert breakdown["Python"] == 2
    assert breakdown["TypeScript"] == 1
    assert breakdown["Markdown"] == 1


def test_primary_language_ignores_docs_and_config():
    """A docs-heavy Python repo is a Python repo, not a Markdown one."""
    breakdown = language_breakdown(
        ["a.md", "b.md", "c.md", "d.md", "e.json", "main.py"]
    )

    assert next(iter(breakdown)) == "Markdown"
    assert primary_code_language(breakdown) == "Python"


def test_primary_language_is_none_when_no_code_present():
    assert primary_code_language(language_breakdown(["README.md"])) is None
