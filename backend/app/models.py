"""Wire models for the analyzer backend.

Names follow the domain vocabulary in CONTEXT.md.
"""

from typing import Literal

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    repo_url: str


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
    component_scores: dict[str, float]
    # None means a Partial Report: Metrics succeeded, the AI Summary did not.
    ai_summary: AISummary | None = None
