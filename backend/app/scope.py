"""Analysis Scope resolution.

Walking a cloned Target Repository, dropping excluded paths, and truncating to
the analysis cap. A repository over the cap is still analysable — just over a
reduced Analysis Scope, which the Report discloses.
"""

from dataclasses import dataclass
from pathlib import Path

# Fixed ignore list. Deliberately not the analysed repo's own .gitignore —
# predictable beats accurate here, and vendored/build output is the same
# everywhere.
IGNORED_DIRS: frozenset[str] = frozenset(
    {
        ".git",
        "node_modules",
        "dist",
        "build",
        "vendor",
        "__pycache__",
        ".venv",
        "venv",
        "target",
        ".next",
        "coverage",
        ".mypy_cache",
        ".pytest_cache",
        ".tox",
    }
)

PYTHON_SUFFIXES = (".py",)
JS_SUFFIXES = (".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs")

LANGUAGE_BY_SUFFIX: dict[str, str] = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".kt": "Kotlin",
    ".rb": "Ruby",
    ".php": "PHP",
    ".cs": "C#",
    ".c": "C",
    ".h": "C",
    ".cpp": "C++",
    ".hpp": "C++",
    ".swift": "Swift",
    ".scala": "Scala",
    ".sh": "Shell",
    ".css": "CSS",
    ".scss": "CSS",
    ".html": "HTML",
    ".md": "Markdown",
    ".json": "JSON",
    ".yml": "YAML",
    ".yaml": "YAML",
}


@dataclass(frozen=True)
class ScopeResult:
    """Files actually in scope, plus what it took to get there."""

    files: list[str]  # repo-relative POSIX paths
    total_seen: int
    truncated: bool


def walk_repository(root: Path) -> list[str]:
    """Every file under `root` that survives the ignore list, as POSIX relpaths."""
    found: list[str] = []
    for dirpath, dirnames, filenames in root.walk():
        # Pruning in place stops os.walk descending into ignored trees at all.
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS]
        for filename in filenames:
            relative = (dirpath / filename).relative_to(root)
            found.append(relative.as_posix())
    return found


def _depth(path: str) -> int:
    return path.count("/")


def resolve_analysis_scope(paths: list[str], max_files: int) -> ScopeResult:
    """Truncate to `max_files`, keeping shallow files first.

    Breadth-first by depth: files nearest the repository root are the ones a
    reader would look at first, so they are the ones worth keeping when a
    repository exceeds the cap.
    """
    ordered = sorted(paths, key=lambda p: (_depth(p), p))
    if len(ordered) <= max_files:
        return ScopeResult(files=ordered, total_seen=len(ordered), truncated=False)
    return ScopeResult(files=ordered[:max_files], total_seen=len(ordered), truncated=True)


def take_by_suffix(files: list[str], suffixes: tuple[str, ...], cap: int) -> list[str]:
    """The first `cap` files matching `suffixes`, preserving the scope ordering."""
    matched = [f for f in files if f.lower().endswith(suffixes)]
    return matched[:cap]


# Markup, config, and docs count toward the language breakdown but must not win
# "primary language" — a documentation-heavy repo is not a Markdown project.
NON_CODE_LANGUAGES: frozenset[str] = frozenset(
    {"Markdown", "JSON", "YAML", "HTML", "CSS"}
)


def language_breakdown(files: list[str]) -> dict[str, int]:
    """File counts per recognised language, most common first."""
    counts: dict[str, int] = {}
    for path in files:
        suffix = Path(path).suffix.lower()
        language = LANGUAGE_BY_SUFFIX.get(suffix)
        if language:
            counts[language] = counts.get(language, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))


def primary_code_language(breakdown: dict[str, int]) -> str | None:
    """The most common language the repository is actually written in."""
    for language in breakdown:
        if language not in NON_CODE_LANGUAGES:
            return language
    return None
