"""Complexity Signal integration tests, against real analyzers.

Unlike the rest of the suite, these run the actual `radon` library and the
actual pinned ESLint install (via subprocess) against real fixture files on
disk — no stubbing. `javascript_signal` is skipped when the pinned install
(`js-analyzer/node_modules`) isn't present, matching production behavior for
an environment without it (see `app.complexity.javascript_signal`).
"""

from pathlib import Path

import pytest

from app.complexity import javascript_signal, python_signal

JS_ANALYZER_DIR = Path(__file__).resolve().parent.parent / "js-analyzer"
_eslint_available = (JS_ANALYZER_DIR / "node_modules" / "eslint").is_dir()


def _write(root: Path, relpath: str, content: str) -> None:
    path = root / relpath
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


SIMPLE_PY = """
def add(a, b):
    return a + b
"""

# Deliberately branchy, to pull the maintainability index down relative to
# `SIMPLE_PY` — the point of the test is the ordering, not an exact value.
COMPLEX_PY = """
def classify(x):
    if x < 0:
        return "negative"
    elif x == 0:
        return "zero"
    elif x < 10:
        for i in range(x):
            if i % 2 == 0:
                print(i)
            elif i % 3 == 0:
                print("fizz")
            else:
                print("other")
        return "small"
    elif x < 100:
        return "medium"
    else:
        return "large"
"""

BROKEN_PY = "def broken(:\n    pass\n"


def test_python_signal_over_real_files(tmp_path):
    _write(tmp_path, "simple.py", SIMPLE_PY)
    _write(tmp_path, "complex.py", COMPLEX_PY)

    signal = python_signal(tmp_path, ["simple.py", "complex.py"], cap=100)

    assert signal is not None
    assert signal.language == "python"
    assert signal.kind == "maintainability"
    assert signal.files_analyzed == 2
    assert 0.0 <= signal.value <= 100.0


def test_python_signal_reflects_real_complexity_differences(tmp_path):
    """The branchy fixture should score a lower maintainability index than
    the simple one — pinning the real `radon` output, not just its range."""
    _write(tmp_path, "simple.py", SIMPLE_PY)
    _write(tmp_path, "complex.py", COMPLEX_PY)

    simple_signal = python_signal(tmp_path, ["simple.py"], cap=100)
    complex_signal = python_signal(tmp_path, ["complex.py"], cap=100)

    assert simple_signal is not None
    assert complex_signal is not None
    assert complex_signal.value < simple_signal.value


def test_python_signal_skips_unparseable_files_but_keeps_the_rest(tmp_path):
    _write(tmp_path, "broken.py", BROKEN_PY)
    _write(tmp_path, "simple.py", SIMPLE_PY)

    signal = python_signal(tmp_path, ["broken.py", "simple.py"], cap=100)

    assert signal is not None
    assert signal.files_analyzed == 1


def test_python_signal_none_when_all_files_unparseable(tmp_path):
    _write(tmp_path, "broken.py", BROKEN_PY)

    assert python_signal(tmp_path, ["broken.py"], cap=100) is None


def test_python_signal_none_without_python_files(tmp_path):
    _write(tmp_path, "readme.md", "# hi")

    assert python_signal(tmp_path, ["readme.md"], cap=100) is None


def test_python_signal_respects_the_cap(tmp_path):
    paths = []
    for i in range(5):
        relpath = f"m{i}.py"
        _write(tmp_path, relpath, SIMPLE_PY)
        paths.append(relpath)

    signal = python_signal(tmp_path, paths, cap=2)

    assert signal is not None
    assert signal.files_analyzed == 2


SIMPLE_JS = """
export function add(a, b) {
  return a + b;
}
"""

# Five branches -> ESLint reports "complexity of 5" for this function, vs. 1
# for the simple one above — the signal should reflect the difference.
COMPLEX_JS = """
export function classify(x) {
  if (x < 0) {
    return "negative";
  } else if (x === 0) {
    return "zero";
  } else if (x < 10) {
    return "small";
  } else if (x < 100) {
    return "medium";
  } else {
    return "large";
  }
}
"""

SIMPLE_TS = """
export function greet(name: string): string {
  return `hello ${name}`;
}
"""


@pytest.mark.skipif(
    not _eslint_available,
    reason="pinned ESLint install not present at backend/js-analyzer/node_modules",
)
def test_javascript_signal_over_real_files(tmp_path):
    _write(tmp_path, "simple.js", SIMPLE_JS)
    _write(tmp_path, "complex.js", COMPLEX_JS)

    signal = javascript_signal(
        tmp_path, ["simple.js", "complex.js"], cap=100, analyzer_dir=str(JS_ANALYZER_DIR)
    )

    assert signal is not None
    assert signal.language == "javascript"
    assert signal.kind == "avg_cyclomatic"
    assert signal.files_analyzed == 2
    assert signal.value == pytest.approx((1 + 5) / 2)


@pytest.mark.skipif(
    not _eslint_available,
    reason="pinned ESLint install not present at backend/js-analyzer/node_modules",
)
def test_javascript_signal_parses_typescript(tmp_path):
    _write(tmp_path, "greet.ts", SIMPLE_TS)

    signal = javascript_signal(
        tmp_path, ["greet.ts"], cap=100, analyzer_dir=str(JS_ANALYZER_DIR)
    )

    assert signal is not None
    assert signal.files_analyzed == 1
    assert signal.value == pytest.approx(1.0)


def test_javascript_signal_none_without_js_files(tmp_path):
    _write(tmp_path, "readme.md", "# hi")

    signal = javascript_signal(
        tmp_path, ["readme.md"], cap=100, analyzer_dir=str(JS_ANALYZER_DIR)
    )

    assert signal is None


def test_javascript_signal_none_when_analyzer_dir_missing(tmp_path):
    _write(tmp_path, "simple.js", SIMPLE_JS)

    signal = javascript_signal(
        tmp_path, ["simple.js"], cap=100, analyzer_dir=str(tmp_path / "no-such-analyzer")
    )

    assert signal is None
