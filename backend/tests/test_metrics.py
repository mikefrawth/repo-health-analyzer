"""Heuristics for tests / CI / README / dependencies."""

import json
import subprocess
from datetime import UTC, datetime, timedelta

import pytest
from app.metrics import (
    _count_dependencies,
    _has_ci,
    _has_readme,
    _has_tests,
    count_recent_commits,
    read_commit_history,
)

NOW = datetime(2026, 8, 15, tzinfo=UTC)


def _ago(*days: float) -> list[datetime]:
    return [NOW - timedelta(days=d) for d in days]


def test_counts_only_commits_inside_the_activity_window():
    stamps = _ago(1, 10, 89, 100, 500)

    assert count_recent_commits(stamps, now=NOW, window_days=90) == 3


def test_a_long_dead_repo_has_no_recent_activity():
    """The defect this fixes: a rich history is not the same as being worked on."""
    stamps = _ago(*[900 + i for i in range(50)])

    assert count_recent_commits(stamps, now=NOW, window_days=90) == 0


def test_an_empty_history_counts_zero():
    assert count_recent_commits([], now=NOW, window_days=90) == 0


def test_timed_out_git_log_is_unmeasurable_not_zero(monkeypatch, tmp_path):
    """The defect this fixes: a subprocess timeout looked identical to a
    repository with zero commits, so it was scored (and penalised) as one."""

    def _raise_timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="git log", timeout=30)

    monkeypatch.setattr(subprocess, "run", _raise_timeout)

    days_ago, commits = read_commit_history(tmp_path)

    assert days_ago is None
    assert commits is None


def test_non_zero_git_log_exit_is_unmeasurable_not_zero(monkeypatch, tmp_path):
    class _Result:
        returncode = 128
        stdout = ""

    monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: _Result())

    days_ago, commits = read_commit_history(tmp_path)

    assert days_ago is None
    assert commits is None


def test_unparseable_git_log_output_is_unmeasurable_not_zero(monkeypatch, tmp_path):
    class _Result:
        returncode = 0
        stdout = "not-a-timestamp\n\n"

    monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: _Result())

    days_ago, commits = read_commit_history(tmp_path)

    assert days_ago is None
    assert commits is None


@pytest.mark.parametrize(
    "path",
    [
        "tests/test_thing.py",
        "test/foo.js",
        "src/__tests__/component.jsx",
        "src/utils.test.ts",
        "src/utils.spec.ts",
        "pkg/thing_test.go",
        "spec/models/user_spec.rb",
    ],
)
def test_recognises_common_test_layouts(path):
    assert _has_tests([path]) is True


@pytest.mark.parametrize(
    "path",
    ["src/main.py", "README.md", "src/latest.py", "contest/entry.py"],
)
def test_does_not_mistake_ordinary_files_for_tests(path):
    assert _has_tests([path]) is False


@pytest.mark.parametrize(
    "path",
    [
        ".github/workflows/ci.yml",
        ".gitlab-ci.yml",
        ".circleci/config.yml",
        ".travis.yml",
        "azure-pipelines.yml",
    ],
)
def test_recognises_common_ci_config(path):
    assert _has_ci([path]) is True


def test_no_ci_config_detected_when_absent():
    assert _has_ci(["src/main.py", "README.md"]) is False


@pytest.mark.parametrize("name", ["README.md", "readme.md", "README.rst", "README"])
def test_recognises_readme_variants(name):
    assert _has_readme([name]) is True


def test_readme_must_be_at_the_root():
    assert _has_readme(["docs/README.md"]) is False


def test_counts_package_json_dependencies(tmp_path):
    (tmp_path / "package.json").write_text(
        json.dumps({"dependencies": {"react": "^18"}, "devDependencies": {"vite": "^5"}}),
        encoding="utf-8",
    )

    assert _count_dependencies(tmp_path) == 2


def test_counts_requirements_txt_ignoring_comments_and_blanks(tmp_path):
    (tmp_path / "requirements.txt").write_text(
        "fastapi>=0.115\n\n# a comment\nhttpx\n", encoding="utf-8"
    )

    assert _count_dependencies(tmp_path) == 2


def test_counts_pyproject_dependencies(tmp_path):
    (tmp_path / "pyproject.toml").write_text(
        '[project]\ndependencies = ["httpx", "fastapi"]\n', encoding="utf-8"
    )

    assert _count_dependencies(tmp_path) == 2


def test_sums_across_multiple_manifests(tmp_path):
    (tmp_path / "package.json").write_text(
        json.dumps({"dependencies": {"react": "^18"}}), encoding="utf-8"
    )
    (tmp_path / "requirements.txt").write_text("httpx\n", encoding="utf-8")

    assert _count_dependencies(tmp_path) == 2


def test_no_manifest_is_unmeasurable_rather_than_zero(tmp_path):
    assert _count_dependencies(tmp_path) is None


def test_malformed_manifest_does_not_crash_the_analysis(tmp_path):
    (tmp_path / "package.json").write_text("{ not json", encoding="utf-8")

    assert _count_dependencies(tmp_path) is None
