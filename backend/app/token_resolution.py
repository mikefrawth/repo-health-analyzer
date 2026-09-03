"""Deciding whose GitHub token a fetch should use.

Progressive OAuth scope (issue #24): a signed-in user's stored token may carry
only GitHub's default (public) scope, or the private-repo ("repo") scope they
granted on a later, separate consent step. This module is a pure decision —
no GitHub call, no session lookup — so it can be pinned with plain unit tests.
"""

from dataclasses import dataclass
from typing import Literal

TokenScope = Literal["public", "repo"]


@dataclass(frozen=True)
class TokenChoice:
    """Which token a fetch should attempt, and what that choice can prove."""

    token: str
    source: Literal["user", "fallback"]
    # Whether `token` is known to carry the private-repo scope. A fetch that
    # 404s using a token that already has this is a genuine "not found" — one
    # that 404s without it is ambiguous (could be missing, could be private
    # and merely invisible to this token) and should prompt for consent
    # instead of reporting a flat "not found".
    has_private_scope: bool

    @property
    def ambiguous_not_found(self) -> bool:
        """A 404 with this token doesn't rule out "private and inaccessible"."""
        return self.source == "user" and not self.has_private_scope


def resolve_github_token(
    user_token: str | None,
    user_token_scope: TokenScope | None,
    fallback_token: str,
) -> TokenChoice:
    """Prefer a signed-in user's own token — it works for public repos just as
    well as the server's, and gives them their own GitHub rate limit — falling
    back to the server's shared token only when there isn't one.

    Never itself returns a "needs consent" signal: whether consent is needed
    can only be known once a fetch with this choice actually 404s (see
    `TokenChoice.ambiguous_not_found`), since GitHub answers "private" and
    "doesn't exist" identically to a token that can't see the repo.
    """
    if user_token:
        return TokenChoice(
            token=user_token,
            source="user",
            has_private_scope=user_token_scope == "repo",
        )
    return TokenChoice(token=fallback_token, source="fallback", has_private_scope=False)
