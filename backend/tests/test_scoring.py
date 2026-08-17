"""The Health Score formula is the one number users trust — pin its behaviour."""

import pytest
from app.models import ComplexitySignal
from app.scoring import WEIGHTS, component_scores, health_score
from conftest import make_metrics


def test_weights_sum_to_100():
    assert sum(WEIGHTS.values()) == 100


def test_perfect_repository_scores_100():
    metrics = make_metrics(
        has_tests=True,
        has_ci=True,
        has_readme=True,
        last_commit_days_ago=1.0,
        commits_in_window=50,
        dependency_count=10,
        complexity=ComplexitySignal(
            language="python", kind="maintainability", value=100.0, files_analyzed=5
        ),
    )
    assert health_score(metrics) == 100


def test_worst_case_repository_scores_0():
    metrics = make_metrics(
        has_tests=False,
        has_ci=False,
        has_readme=False,
        last_commit_days_ago=400.0,
        commits_in_window=0,
        dependency_count=500,
        complexity=ComplexitySignal(
            language="javascript", kind="avg_cyclomatic", value=50.0, files_analyzed=5
        ),
    )
    # Dependency hygiene bottoms out at a floor rather than 0, so the worst
    # possible repository still scores a little above zero.
    assert 0 <= health_score(metrics) <= 5


def test_score_is_deterministic():
    metrics = make_metrics()
    assert health_score(metrics) == health_score(metrics)


def test_absent_complexity_is_excluded_from_the_weighted_average():
    """An unmeasurable component is not scored as a failure."""
    without = make_metrics(complexity=None)

    assert "complexity" not in component_scores(without)


def _flawless(**overrides):
    """A repository that scores full marks on every component it has."""
    base = dict(
        has_tests=True,
        has_ci=True,
        has_readme=True,
        last_commit_days_ago=1.0,
        commits_in_window=50,
        dependency_count=10,
        complexity=ComplexitySignal(
            language="python", kind="maintainability", value=100.0, files_analyzed=5
        ),
    )
    return make_metrics(**{**base, **overrides})


def test_a_fully_measured_repository_can_reach_100():
    assert health_score(_flawless()) == 100


def test_an_unmeasurable_repository_cannot_reach_100():
    """The defect this fixes: revealing least about yourself scored highest."""
    barely_inspected = _flawless(dependency_count=None, complexity=None)

    assert health_score(barely_inspected) < 100


def test_the_cap_scales_with_how_much_was_measured():
    fully_measured = health_score(_flawless())
    one_dropped = health_score(_flawless(complexity=None))
    two_dropped = health_score(_flawless(complexity=None, dependency_count=None))

    assert fully_measured > one_dropped > two_dropped


def test_the_cap_never_raises_a_poor_score():
    """Capping is a ceiling, not a curve — it must not help a bad repository."""
    poor = make_metrics(
        has_tests=False,
        has_ci=False,
        has_readme=False,
        last_commit_days_ago=900.0,
        commits_in_window=0,
        dependency_count=None,
        complexity=None,
    )

    assert health_score(poor) < 20


def test_missing_tests_costs_exactly_its_weight():
    """With every component measurable, weights are the score directly."""
    signal = ComplexitySignal(
        language="python", kind="maintainability", value=100.0, files_analyzed=5
    )
    with_tests = make_metrics(has_tests=True, complexity=signal)
    without_tests = make_metrics(has_tests=False, complexity=signal)

    assert health_score(with_tests) - health_score(without_tests) == WEIGHTS["tests"]


def test_dropping_a_component_reweights_the_rest_within_the_cap():
    """Renormalisation still makes the rest count for more of what's left —
    but the confidence cap now bounds how far that can lift the top end, so
    the *visible* swing between having and lacking a component can shrink
    even though the underlying reweighting grew. Both mechanisms are
    deliberate; this pins their interaction rather than either one alone.
    """
    signal = ComplexitySignal(
        language="python", kind="maintainability", value=100.0, files_analyzed=5
    )
    with_complexity_high = health_score(make_metrics(has_tests=True, complexity=signal))
    with_complexity_low = health_score(make_metrics(has_tests=False, complexity=signal))
    without_complexity_high = health_score(make_metrics(has_tests=True, complexity=None))
    without_complexity_low = health_score(make_metrics(has_tests=False, complexity=None))

    # The cap holds even here: dropping a component must not let the score
    # exceed what full measurement earns.
    assert without_complexity_high <= with_complexity_high
    # Renormalisation still moves the low end down less far than a straight
    # 20-point weight would, because the surviving components are worth more.
    assert without_complexity_low > with_complexity_low - WEIGHTS["tests"]


@pytest.mark.parametrize(
    ("days", "expected"),
    [(0.0, 1.0), (30.0, 1.0), (365.0, 0.0), (1000.0, 0.0)],
)
def test_commit_recency_bounds(days, expected):
    scores = component_scores(make_metrics(last_commit_days_ago=days))
    assert scores["commit_recency"] == pytest.approx(expected)


def test_commit_recency_decays_between_bounds():
    fresher = component_scores(make_metrics(last_commit_days_ago=60.0))
    staler = component_scores(make_metrics(last_commit_days_ago=200.0))
    assert 0.0 < staler["commit_recency"] < fresher["commit_recency"] < 1.0


def test_unmeasurable_recency_drops_the_component():
    scores = component_scores(make_metrics(last_commit_days_ago=None))
    assert "commit_recency" not in scores


def test_no_manifest_is_unmeasurable_not_a_penalty():
    """A repo with no dependency file isn't unhealthy — it's unmeasured."""
    scores = component_scores(make_metrics(dependency_count=None))
    assert "dependency_hygiene" not in scores


def test_lean_dependencies_beat_bloated_ones():
    lean = component_scores(make_metrics(dependency_count=10))
    bloated = component_scores(make_metrics(dependency_count=300))
    assert lean["dependency_hygiene"] == 1.0
    assert bloated["dependency_hygiene"] < lean["dependency_hygiene"]


def test_low_cyclomatic_complexity_scores_better_than_high():
    simple = make_metrics(
        complexity=ComplexitySignal(
            language="javascript", kind="avg_cyclomatic", value=3.0, files_analyzed=10
        )
    )
    tangled = make_metrics(
        complexity=ComplexitySignal(
            language="javascript", kind="avg_cyclomatic", value=25.0, files_analyzed=10
        )
    )
    assert health_score(simple) > health_score(tangled)


def test_score_always_within_bounds():
    for days in (0.0, 45.0, 500.0):
        for deps in (None, 0, 1000):
            score = health_score(
                make_metrics(last_commit_days_ago=days, dependency_count=deps)
            )
            assert 0 <= score <= 100
