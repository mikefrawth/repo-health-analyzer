"""The AI Summary: Claude's qualitative read on a Target Repository.

Claude writes Strengths, Risks, and Suggestions. It never produces the Health
Score — that is computed deterministically from Metrics before this module is
called, and is passed in only as context. A failure here yields a Partial
Report rather than failing the whole analysis.
"""

import json
import logging

import anthropic
from pydantic import ValidationError

from .config import Settings
from .models import AISummary, AnalysisScope, Metrics

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a staff engineer reviewing an unfamiliar codebase.

You are given objective metrics gathered from a public GitHub repository, plus \
a health score that was already computed from those metrics by a fixed formula. \
Your job is the qualitative read that the numbers cannot give on their own.

Ground every point in the metrics you were given. Where the metrics are silent, \
say so rather than inventing detail — you have not read the source, only \
measurements of it. Do not restate the score or re-derive it; it is settled.

Write for the repository's maintainer: specific, concrete, and free of filler. \
One or two sentences per point."""

USER_TEMPLATE = """Repository: {repo_url}

Health score (already computed, do not revise): {health_score}/100

Metrics:
{metrics}

Analysis scope:
{scope}

Give exactly three strengths, three risks, and three suggested improvements."""


def _build_prompt(
    repo_url: str, metrics: Metrics, health_score: int, scope: AnalysisScope
) -> str:
    scope_note = (
        f"{scope.files_analyzed} of {scope.total_files_seen} files examined"
        f"{' (truncated to the analysis cap)' if scope.truncated else ''}; "
        f"{scope.python_files_analyzed} Python and {scope.js_files_analyzed} "
        "JS/TS files were measured for complexity."
    )
    return USER_TEMPLATE.format(
        repo_url=repo_url,
        health_score=health_score,
        metrics=json.dumps(metrics.model_dump(), indent=2, default=str),
        scope=scope_note,
    )


async def generate_summary(
    repo_url: str,
    metrics: Metrics,
    health_score: int,
    scope: AnalysisScope,
    settings: Settings,
) -> AISummary | None:
    """Ask Claude for the qualitative summary, or None if it can't be had."""
    if not settings.anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY is unset; returning a Partial Report")
        return None

    client = anthropic.AsyncAnthropic(
        api_key=settings.anthropic_api_key,
        timeout=settings.claude_timeout_seconds,
    )

    try:
        response = await client.messages.parse(
            model=settings.claude_model,
            max_tokens=8000,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": _build_prompt(repo_url, metrics, health_score, scope),
                }
            ],
            output_format=AISummary,
        )
    except (anthropic.APIError, anthropic.APIConnectionError) as exc:
        logger.warning("Claude call failed, returning a Partial Report: %s", exc)
        return None

    if response.stop_reason == "refusal":
        logger.warning("Claude declined to summarise %s", repo_url)
        return None

    summary = response.parsed_output
    if summary is None:
        logger.warning("Claude returned no parseable summary for %s", repo_url)
        return None

    try:
        return AISummary(
            strengths=summary.strengths[:3],
            risks=summary.risks[:3],
            suggestions=summary.suggestions[:3],
        )
    except ValidationError as exc:
        logger.warning("Claude's summary failed validation: %s", exc)
        return None
