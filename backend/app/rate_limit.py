"""Per-IP daily limit on anonymous free-report requests.

Guards the one thing this app does on every request that costs money or
quota — a GitHub API call plus a clone — from being hammered by a single
anonymous caller. There is no login yet (see ticket #20), so today this
governs every request; once identity exists, only the anonymous path
should call `enforce_anonymous_rate_limit`.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from .config import Settings
from .errors import AnalysisError


class RequestCounter:
    """In-memory per-IP-per-day request counts.

    A process-local counter resets on restart and isn't shared across
    replicas — good enough for a single backend instance. Swapping in a
    shared store (e.g. Redis) later replaces this class, not its callers.
    """

    def __init__(self) -> None:
        self._counts: dict[tuple[str, str], int] = defaultdict(int)

    def increment(self, key: str) -> int:
        """Record one request for `key` today and return today's new total."""
        bucket = (key, datetime.now(timezone.utc).date().isoformat())
        self._counts[bucket] += 1
        return self._counts[bucket]


def enforce_anonymous_rate_limit(
    client_ip: str, settings: Settings, counter: RequestCounter
) -> None:
    """Raise an AnalysisError once `client_ip` exceeds today's limit.

    Distinct status code (429) so a rate-limited visitor sees a clear,
    specific message rather than reading as a generic failure.
    """
    count = counter.increment(client_ip)
    if count > settings.anonymous_daily_request_limit:
        raise AnalysisError(
            "You've reached today's request limit for anonymous analysis. "
            "Please try again tomorrow.",
            status_code=429,
        )
