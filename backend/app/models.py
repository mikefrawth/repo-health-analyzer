"""Wire models for the analyzer backend.

Names follow the domain vocabulary in CONTEXT.md.
"""

from typing import Literal

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    repo_url: str


# The seven categories the Health Score formula weights and combines (see
# `app.scoring.WEIGHTS`). A `Literal` rather than `str` so a typo'd or
# retired component key fails type checking instead of silently drifting out
# of sync between the formula, the response, and callers.
ComponentKey = Literal[
    "tests",
    "ci",
    "readme",
    "commit_recency",
    "commit_activity",
    "dependency_hygiene",
    "complexity",
]


class AnalysisScope(BaseModel):
    """The bounded subset of a Target Repository actually examined."""

    total_files_seen: int
    files_analyzed: int
    truncated: bool
    python_files_analyzed: int
    js_files_analyzed: int


class ComplexitySignal(BaseModel):
    """Per-language complexity measurement, when a supported analyzer applies."""

    language: Literal["python", "javascript"]
    # `maintainability` is radon's MI (0-100, higher is better).
    # `avg_cyclomatic` is the mean per-function cyclomatic complexity (lower is better).
    kind: Literal["maintainability", "avg_cyclomatic"]
    value: float
    files_analyzed: int


class Metrics(BaseModel):
    """Objective, deterministically-computed measurements."""

    file_count: int
    dependency_count: int | None
    has_tests: bool
    has_ci: bool
    has_readme: bool
    last_commit_days_ago: float | None
    commits_in_window: int
    language_breakdown: dict[str, int] = Field(default_factory=dict)
    primary_language: str | None
    complexity: ComplexitySignal | None = None


class AISummary(BaseModel):
    """The qualitative narrative. Never the source of the Health Score.

    Deliberately unconstrained lengths: the prompt asks for three of each, and
    the caller trims. A model that returns four Strengths should not cost the
    user their whole summary.
    """

    strengths: list[str]
    risks: list[str]
    suggestions: list[str]


class AnalyzeResponse(BaseModel):
    repo_url: str
    metrics: Metrics
    health_score: int
    analysis_scope: AnalysisScope
    # The same values `component_scores(metrics)` computes internally for
    # `health_score` — exposed so a Report can disclose why the score is what
    # it is. A component absent here has no Component Score, per CONTEXT.md.
    component_scores: dict[ComponentKey, float]
    # The fixed weight (out of 100) each component carries in the formula
    # (`app.scoring.WEIGHTS`, unfiltered — always all seven keys, regardless
    # of which components `component_scores` measured). Shipped alongside the
    # scores so a caller can compute a weighted contribution without a second,
    # hand-mirrored copy of the weight table (see ADR-0006).
    component_weights: dict[ComponentKey, int]
    # None means a Partial Report: Metrics succeeded, the AI Summary did not.
    ai_summary: AISummary | None = None
    # Whether the Target Repository was private on GitHub at generation time.
    # Recorded on the Report itself (issue #22) so the "a Report sourced from a
    # private repo can never be made public" rule can be enforced downstream,
    # independent of whether the repo's visibility later changes.
    private: bool = False
