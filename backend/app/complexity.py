"""Complexity Signals.

Per-language complexity measured over the Analysis Scope. Only languages with
a supported analyser produce a signal; everything else simply has none, and the
Health Score renormalises around the gap.
"""

import json
import re
import subprocess
from pathlib import Path

from .models import ComplexitySignal
from .scope import JS_SUFFIXES, PYTHON_SUFFIXES, take_by_suffix

_ESLINT_COMPLEXITY = re.compile(r"complexity of (\d+)")

# ESLint chokes on very long argument lists on Windows; feed it in batches.
_ESLINT_BATCH = 25


def python_signal(root: Path, files: list[str], cap: int) -> ComplexitySignal | None:
    """Mean radon maintainability index across the Python files in scope."""
    from radon.metrics import mi_visit

    selected = take_by_suffix(files, PYTHON_SUFFIXES, cap)
    if not selected:
        return None

    scores: list[float] = []
    for relpath in selected:
        try:
            source = (root / relpath).read_text(encoding="utf-8", errors="replace")
            scores.append(mi_visit(source, multi=True))
        except (OSError, SyntaxError, ValueError):
            # An unparseable file tells us nothing about maintainability; the
            # remaining files still do.
            continue

    if not scores:
        return None

    return ComplexitySignal(
        language="python",
        kind="maintainability",
        value=round(sum(scores) / len(scores), 2),
        files_analyzed=len(scores),
    )


def _run_eslint(analyzer_dir: Path, config: Path, root: Path, batch: list[str]) -> str:
    eslint = analyzer_dir / "node_modules" / "eslint" / "bin" / "eslint.js"
    result = subprocess.run(
        [
            "node",
            str(eslint),
            "--no-config-lookup",
            "--config",
            str(config),
            "--format",
            "json",
            *batch,
        ],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=120,
    )
    # ESLint exits non-zero when it reports problems, which is the normal case
    # here — every function trips the complexity rule by design.
    return result.stdout


def javascript_signal(
    root: Path, files: list[str], cap: int, analyzer_dir: str
) -> ComplexitySignal | None:
    """Mean per-function cyclomatic complexity across the JS/TS files in scope.

    Runs ESLint with only the `complexity` rule, from a pinned install that
    ships with the backend — the analysed repository's own ESLint config and
    dependencies are never installed or consulted.
    """
    selected = take_by_suffix(files, JS_SUFFIXES, cap)
    if not selected:
        return None

    directory = Path(analyzer_dir)
    config = directory / "eslint.config.mjs"
    if not (directory / "node_modules" / "eslint").is_dir() or not config.is_file():
        # No pinned analyser available (common in local dev) — no signal.
        return None

    complexities: list[int] = []
    analyzed: set[str] = set()

    for start in range(0, len(selected), _ESLINT_BATCH):
        batch = selected[start : start + _ESLINT_BATCH]
        try:
            output = _run_eslint(directory, config, root, batch)
        except (subprocess.TimeoutExpired, OSError):
            continue
        if not output.strip():
            continue
        try:
            results = json.loads(output)
        except json.JSONDecodeError:
            continue

        for entry in results:
            for message in entry.get("messages", []):
                match = _ESLINT_COMPLEXITY.search(message.get("message", ""))
                if match:
                    complexities.append(int(match.group(1)))
                    analyzed.add(entry.get("filePath", ""))

    if not complexities:
        return None

    return ComplexitySignal(
        language="javascript",
        kind="avg_cyclomatic",
        value=round(sum(complexities) / len(complexities), 2),
        files_analyzed=len(analyzed),
    )
