"""Orchestration: URL in, Report out.

The one place that knows the whole sequence — validate, size-check, clone,
scope, measure, score, summarise.
"""

import logging

from starlette.concurrency import run_in_threadpool

from .ai_summary import generate_summary
from .complexity import javascript_signal, python_signal
from .config import Settings
from .errors import AnalysisError
from .github import (
    assert_within_size_limit,
    clone_repository,
    fetch_repo_metadata,
    parse_repo_url,
)
from .metrics import compute_metrics
from .models import AnalysisScope, AnalyzeResponse, Metrics
from .scope import (
    JS_SUFFIXES,
    PYTHON_SUFFIXES,
    resolve_analysis_scope,
    take_by_suffix,
    walk_repository,
)
from .scoring import WEIGHTS, component_scores, health_score
from .token_resolution import TokenScope, resolve_github_token

logger = logging.getLogger(__name__)


def _measure_clone(
    owner: str, repo: str, settings: Settings, token: str = ""
) -> tuple[Metrics, AnalysisScope]:
    """Clone, resolve the Analysis Scope, and measure. Blocking by nature."""
    with clone_repository(owner, repo, settings.clone_depth, token) as root:
        scope_result = resolve_analysis_scope(
            walk_repository(root), settings.max_files
        )
        metrics = compute_metrics(root, scope_result)

        python_files = take_by_suffix(
            scope_result.files, PYTHON_SUFFIXES, settings.max_python_files
        )
        js_files = take_by_suffix(
            scope_result.files, JS_SUFFIXES, settings.max_js_files
        )

        # One Complexity Signal per repository, from whichever supported
        # language dominates. A Python-majority repo is measured with radon; a
        # JS/TS-majority one with ESLint.
        signal = None
        if metrics.primary_language == "Python":
            signal = python_signal(
                root, scope_result.files, settings.max_python_files
            )
        elif metrics.primary_language in ("JavaScript", "TypeScript"):
            signal = javascript_signal(
                root,
                scope_result.files,
                settings.max_js_files,
                settings.js_analyzer_dir,
            )
        metrics.complexity = signal

        scope = AnalysisScope(
            total_files_seen=scope_result.total_seen,
            files_analyzed=len(scope_result.files),
            truncated=scope_result.truncated,
            python_files_analyzed=len(python_files),
            js_files_analyzed=len(js_files),
        )
        return metrics, scope


async def analyze(
    repo_url: str,
    settings: Settings,
    user_github_token: str | None = None,
    user_github_token_scope: TokenScope | None = None,
) -> AnalyzeResponse:
    owner, repo = parse_repo_url(repo_url)

    # Issue #24: a signed-in user's own token is preferred (their own rate
    # limit; the only way to see a private repo at all). `choice` doesn't yet
    # know whether this repo is private — GitHub answers "private" and
    # "doesn't exist" identically to a token that can't see it — so that's
    # resolved below, from how the fetch actually turns out.
    choice = resolve_github_token(
        user_github_token, user_github_token_scope, settings.github_token
    )

    try:
        metadata = await fetch_repo_metadata(owner, repo, choice.token)
    except AnalysisError as exc:
        if exc.status_code == 404 and choice.ambiguous_not_found:
            raise AnalysisError(
                "This may be a private repository. Grant access to your "
                "private GitHub repositories to try again.",
                status_code=404,
                code="needs_private_scope",
            ) from exc
        raise
    assert_within_size_limit(metadata, settings.max_repo_size_kb)
    is_private = bool(metadata.get("private", False))

    metrics, scope = await run_in_threadpool(
        _measure_clone, owner, repo, settings, choice.token
    )
    score = health_score(metrics)
    scores = component_scores(metrics)

    # Issue #24: a private-repo Report is quantitative-only in v1 — no
    # subscription/credit machinery exists yet to charge for its AI Summary,
    # so it isn't generated at all rather than attempted and discarded.
    # Otherwise, a failed summary yields a Partial Report; the metrics stand
    # on their own.
    summary = (
        None
        if is_private
        else await generate_summary(repo_url, metrics, score, scope, settings)
    )

    return AnalyzeResponse(
        repo_url=repo_url,
        metrics=metrics,
        health_score=score,
        analysis_scope=scope,
        component_scores=scores,
        component_weights=WEIGHTS,
        ai_summary=summary,
        private=is_private,
    )
