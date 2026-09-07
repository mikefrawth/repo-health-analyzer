"""URL validation and the pre-clone size guard."""

import json
from pathlib import Path

import pytest
from app.errors import AnalysisError
from app.github import assert_within_size_limit, parse_repo_url

# Shared with frontend/tests/repo-url.test.ts, so the backend and frontend
# patterns can never silently disagree about what they accept. See issue #42.
_FIXTURE = json.loads(
    (Path(__file__).parents[2] / "repo-url-cases.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize("case", _FIXTURE["accept"], ids=lambda case: case["url"])
def test_accepts_the_shapes_users_actually_paste(case):
    assert parse_repo_url(case["url"]) == (case["owner"], case["repo"])


@pytest.mark.parametrize("url", _FIXTURE["reject"], ids=lambda url: repr(url))
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
