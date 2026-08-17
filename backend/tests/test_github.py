"""URL validation and the pre-clone size guard."""

import pytest
from app.errors import AnalysisError
from app.github import assert_within_size_limit, parse_repo_url


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/owner/repo",
        "http://github.com/owner/repo",
        "github.com/owner/repo",
        "https://www.github.com/owner/repo",
        "https://github.com/owner/repo.git",
        "https://github.com/owner/repo/",
        "  https://github.com/owner/repo  ",
    ],
)
def test_accepts_the_shapes_users_actually_paste(url):
    assert parse_repo_url(url) == ("owner", "repo")


def test_preserves_dots_and_dashes_in_names():
    assert parse_repo_url("https://github.com/my-org/my.repo") == ("my-org", "my.repo")


@pytest.mark.parametrize(
    "url",
    [
        "https://gitlab.com/owner/repo",
        "https://github.com/owner",
        "not a url at all",
        "",
        "https://example.com/github.com/owner/repo",
    ],
)
def test_rejects_anything_that_is_not_a_github_repo_url(url):
    with pytest.raises(AnalysisError) as exc:
        parse_repo_url(url)

    assert "github.com/owner/repo" in str(exc.value)


def test_allows_a_repository_within_the_size_limit():
    assert_within_size_limit({"size": 5_000}, max_size_kb=200_000)


def test_rejects_an_oversized_repository_before_cloning():
    with pytest.raises(AnalysisError) as exc:
        assert_within_size_limit({"size": 500_000}, max_size_kb=200_000)

    assert exc.value.status_code == 413
    assert "MB" in exc.value.message


def test_missing_size_field_is_treated_as_zero():
    assert_within_size_limit({}, max_size_kb=200_000)
