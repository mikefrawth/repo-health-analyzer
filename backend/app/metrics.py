"""Metrics computation over a cloned Target Repository."""

import json
import re
import subprocess
import tomllib
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .models import Metrics
from .scope import ScopeResult, language_breakdown, primary_code_language

README_NAMES = ("readme.md", "readme.rst", "readme.txt", "readme")

CI_PATHS = (
    ".github/workflows",
    ".gitlab-ci.yml",
    ".circleci/config.yml",
    ".travis.yml",
    "azure-pipelines.yml",
    "jenkinsfile",
    ".drone.yml",
    "bitbucket-pipelines.yml",
)

TEST_DIR_NAMES = ("test", "tests", "spec", "__tests__", "e2e")
TEST_FILE_PATTERN = re.compile(
    r"(^|/)(test_[^/]+|[^/]+_test|[^/]+\.(test|spec))\.[a-z]+$", re.IGNORECASE
)


def _has_readme(files: list[str]) -> bool:
    return any(f.lower() in README_NAMES for f in files)


def _has_ci(files: list[str]) -> bool:
    lowered = {f.lower() for f in files}
    for marker in CI_PATHS:
        if marker in lowered:
            return True
        if any(f.startswith(f"{marker}/") for f in lowered):
            return True
    return False


def _has_tests(files: list[str]) -> bool:
    for path in files:
        if TEST_FILE_PATTERN.search(path):
            return True
        parts = [segment.lower() for segment in path.split("/")[:-1]]
        if any(segment in TEST_DIR_NAMES for segment in parts):
            return True
    return False


def _count_dependencies(root: Path) -> int | None:
    """Direct dependency count from whichever manifest we recognise.

    Returns None when the repository declares no dependencies anywhere — that
    is unmeasurable rather than zero, and the Health Score treats it as such.
    """
    total: int | None = None

    package_json = root / "package.json"
    if package_json.is_file():
        try:
            data = json.loads(package_json.read_text(encoding="utf-8"))
            count = len(data.get("dependencies") or {}) + len(
                data.get("devDependencies") or {}
            )
            total = (total or 0) + count
        except (json.JSONDecodeError, OSError, UnicodeDecodeError):
            pass

    requirements = root / "requirements.txt"
    if requirements.is_file():
        try:
            lines = requirements.read_text(encoding="utf-8", errors="replace").splitlines()
            count = sum(
                1 for line in lines if line.strip() and not line.strip().startswith("#")
            )
            total = (total or 0) + count
        except OSError:
            pass

    pyproject = root / "pyproject.toml"
    if pyproject.is_file():
        try:
            data = tomllib.loads(pyproject.read_text(encoding="utf-8"))
            project_deps = (data.get("project") or {}).get("dependencies") or []
            poetry_deps = (
                ((data.get("tool") or {}).get("poetry") or {}).get("dependencies") or {}
            )
            count = len(project_deps) + len(poetry_deps)
            if count:
                total = (total or 0) + count
        except (tomllib.TOMLDecodeError, OSError, UnicodeDecodeError):
            pass

    return total


# How far back "actively worked on" reaches. Commits older than this say
# something about the repository's past, not its present.
ACTIVITY_WINDOW_DAYS = 90


def count_recent_commits(
    timestamps: list[datetime], now: datetime, window_days: int = ACTIVITY_WINDOW_DAYS
) -> int:
    """Commits landed within the trailing window.

    Counting every commit in the clone instead would hand a repository
    abandoned for years full marks for activity, purely for having a history.
    """
    cutoff = now - timedelta(days=window_days)
    return sum(1 for stamp in timestamps if stamp >= cutoff)


def read_commit_history(root: Path) -> tuple[float | None, int]:
    """(days since the last commit, commits within the activity window)."""
    try:
        result = subprocess.run(
            ["git", "log", "--format=%cI"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (subprocess.TimeoutExpired, OSError):
        return None, 0

    if result.returncode != 0:
        return None, 0

    parsed: list[datetime] = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            parsed.append(datetime.fromisoformat(line))
        except ValueError:
            continue

    if not parsed:
        return None, 0

    now = datetime.now(UTC)
    days_ago = (now - parsed[0]).total_seconds() / 86_400
    return max(0.0, days_ago), count_recent_commits(parsed, now=now)


def compute_metrics(root: Path, scope: ScopeResult) -> Metrics:
    """Everything measurable about a Target Repository, short of complexity.

    The Complexity Signal is attached separately by the complexity analysers,
    since it depends on which languages the repository actually uses.
    """
    files = scope.files
    breakdown = language_breakdown(files)
    last_commit_days_ago, commits = read_commit_history(root)

    return Metrics(
        file_count=scope.total_seen,
        dependency_count=_count_dependencies(root),
        has_tests=_has_tests(files),
        has_ci=_has_ci(files),
        has_readme=_has_readme(files),
        last_commit_days_ago=last_commit_days_ago,
        commits_in_window=commits,
        language_breakdown=breakdown,
        primary_language=primary_code_language(breakdown),
    )
