from app.models import Metrics


def make_metrics(**overrides) -> Metrics:
    """A middling-but-valid Metrics, so each test states only what it cares about."""
    defaults = dict(
        file_count=100,
        dependency_count=20,
        has_tests=True,
        has_ci=True,
        has_readme=True,
        last_commit_days_ago=10.0,
        commits_in_window=20,
        language_breakdown={"Python": 80},
        primary_language="Python",
        complexity=None,
    )
    return Metrics(**{**defaults, **overrides})
