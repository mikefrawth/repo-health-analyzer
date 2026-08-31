"""The deterministic Health Score.

The score is a pure function of Metrics. The AI Summary never contributes to
it, so the same Metrics always yield the same Health Score. See
docs/adr/0001-deterministic-health-score.md.

Each component scores 0.0-1.0 and carries a fixed weight. Components that
cannot be measured for a given Target Repository (most often the Complexity
Signal) are dropped and the remaining weights are renormalised, so an
unmeasurable component neither helps nor hurts.
"""

from .models import ComponentKey, Metrics

WEIGHTS: dict[ComponentKey, int] = {
    "tests": 20,
    "ci": 15,
    "readme": 15,
    "commit_recency": 12,
    "commit_activity": 8,
    "dependency_hygiene": 10,
    "complexity": 20,
}

# Commit recency: full marks at or under FRESH_DAYS, zero at or over STALE_DAYS.
FRESH_DAYS = 30.0
STALE_DAYS = 365.0

# Commit activity: full marks once the clone window contains this many commits.
ACTIVE_COMMITS = 20

# Dependency hygiene: full marks up to LEAN_DEPS, falling to a floor at BLOATED_DEPS.
LEAN_DEPS = 50
BLOATED_DEPS = 200
BLOATED_DEPS_SCORE = 0.3

# Cyclomatic complexity: full marks at or under SIMPLE_CC, zero at or over TANGLED_CC.
SIMPLE_CC = 5.0
TANGLED_CC = 20.0

# How much of each unmeasured weight point is withheld from the score ceiling.
# At 0.5, a repository with 30 points of weight dropped can score at most 85.
UNMEASURED_PENALTY = 0.5


def _lerp_down(value: float, best: float, worst: float) -> float:
    """1.0 at `best`, 0.0 at `worst`, linear between. Lower input is better."""
    if value <= best:
        return 1.0
    if value >= worst:
        return 0.0
    return 1.0 - (value - best) / (worst - best)


def _commit_recency(days_ago: float | None) -> float | None:
    if days_ago is None:
        return None
    return _lerp_down(days_ago, FRESH_DAYS, STALE_DAYS)


def _commit_activity(commits: int) -> float:
    return min(commits, ACTIVE_COMMITS) / ACTIVE_COMMITS


def _dependency_hygiene(count: int | None) -> float | None:
    # No manifest at all is unmeasurable, not a failure — a repo can legitimately
    # have no dependency file.
    if count is None:
        return None
    if count <= LEAN_DEPS:
        return 1.0
    scaled = _lerp_down(float(count), float(LEAN_DEPS), float(BLOATED_DEPS))
    return BLOATED_DEPS_SCORE + scaled * (1.0 - BLOATED_DEPS_SCORE)


def _complexity(metrics: Metrics) -> float | None:
    signal = metrics.complexity
    if signal is None:
        return None
    if signal.kind == "maintainability":
        # radon's maintainability index is already 0-100, higher is better.
        return max(0.0, min(1.0, signal.value / 100.0))
    return _lerp_down(signal.value, SIMPLE_CC, TANGLED_CC)


def component_scores(metrics: Metrics) -> dict[ComponentKey, float]:
    """Per-component scores in 0.0-1.0, omitting unmeasurable components."""
    raw: dict[ComponentKey, float | None] = {
        "tests": 1.0 if metrics.has_tests else 0.0,
        "ci": 1.0 if metrics.has_ci else 0.0,
        "readme": 1.0 if metrics.has_readme else 0.0,
        "commit_recency": _commit_recency(metrics.last_commit_days_ago),
        "commit_activity": _commit_activity(metrics.commits_in_window),
        "dependency_hygiene": _dependency_hygiene(metrics.dependency_count),
        "complexity": _complexity(metrics),
    }
    return {name: score for name, score in raw.items() if score is not None}


def confidence_cap(measured_weight: int) -> float:
    """The highest score a repository is allowed given how much we could measure.

    Renormalising alone made unmeasurable components free: a repository we
    could barely inspect scored full marks on the handful of things we could
    see. The cap keeps the renormalisation — an unsupported language is still
    not scored as a failure — while reserving the top of the range for
    repositories we actually measured.
    """
    unmeasured = max(0, 100 - measured_weight)
    return 100.0 - unmeasured * UNMEASURED_PENALTY


def health_score(metrics: Metrics) -> int:
    """Compute the 0-100 Health Score from Metrics."""
    scores = component_scores(metrics)
    total_weight = sum(WEIGHTS[name] for name in scores)
    if total_weight == 0:
        return 0
    earned = sum(WEIGHTS[name] * score for name, score in scores.items())
    weighted = earned / total_weight * 100
    return round(min(weighted, confidence_cap(total_weight)))
