"""Issue #24: which GitHub token a fetch should use, and whether a 404 with
that token is ambiguous enough to warrant asking for more access."""

from app.token_resolution import resolve_github_token


def test_an_anonymous_request_uses_the_server_fallback_token():
    choice = resolve_github_token(None, None, "server-token")

    assert choice.token == "server-token"
    assert choice.source == "fallback"
    assert choice.ambiguous_not_found is False


def test_a_signed_in_user_with_no_stored_token_uses_the_fallback():
    choice = resolve_github_token(None, "public", "server-token")

    assert choice.source == "fallback"


def test_a_signed_in_user_prefers_their_own_public_scope_token():
    choice = resolve_github_token("user-token", "public", "server-token")

    assert choice.token == "user-token"
    assert choice.source == "user"


def test_a_public_scope_token_makes_a_404_ambiguous():
    """Could be genuinely missing, or could be private and invisible to this
    token — GitHub answers both the same way, so we can't tell yet."""
    choice = resolve_github_token("user-token", "public", "server-token")

    assert choice.ambiguous_not_found is True


def test_a_repo_scope_token_makes_a_404_unambiguous():
    choice = resolve_github_token("user-token", "repo", "server-token")

    assert choice.token == "user-token"
    assert choice.source == "user"
    assert choice.ambiguous_not_found is False


def test_the_server_fallback_token_never_looks_like_a_scope_gap():
    """An anonymous 404 is just "not found" — there's no user to prompt."""
    choice = resolve_github_token(None, None, "server-token")

    assert choice.ambiguous_not_found is False
