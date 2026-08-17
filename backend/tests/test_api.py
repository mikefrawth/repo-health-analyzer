"""The HTTP surface, tested through the app rather than around it.

Two behaviours matter here and neither is visible from the pure functions:
the shared secret actually gates the endpoint, and a failed AI Summary still
yields a Report.
"""

import pytest
from app import analyzer
from app.config import Settings, get_settings
from app.main import app
from app.models import AISummary, AnalysisScope
from app.scoring import health_score
from conftest import make_metrics
from fastapi.testclient import TestClient

SECRET = "test-secret-value"


@pytest.fixture
def client():
    app.dependency_overrides[get_settings] = lambda: Settings(
        internal_api_secret=SECRET
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_rejects_a_request_with_no_secret(client):
    response = client.post("/analyze", json={"repo_url": "https://github.com/a/b"})

    assert response.status_code == 401


def test_rejects_a_request_with_the_wrong_secret(client):
    response = client.post(
        "/analyze",
        json={"repo_url": "https://github.com/a/b"},
        headers={"X-Internal-Secret": "not-the-secret"},
    )

    assert response.status_code == 401


def test_health_check_needs_no_secret(client):
    assert client.get("/health").status_code == 200


@pytest.fixture
def stub_repository(monkeypatch):
    """Stand in for GitHub and the clone, leaving real scoring and orchestration."""
    metrics = make_metrics(has_tests=False, last_commit_days_ago=5.0)
    scope = AnalysisScope(
        total_files_seen=120,
        files_analyzed=120,
        truncated=False,
        python_files_analyzed=40,
        js_files_analyzed=0,
    )

    async def fake_metadata(owner, repo, token):
        return {"size": 1_000}

    def fake_measure(owner, repo, settings):
        return metrics, scope

    monkeypatch.setattr(analyzer, "fetch_repo_metadata", fake_metadata)
    monkeypatch.setattr(analyzer, "_measure_clone", fake_measure)
    return metrics


def test_unavailable_ai_summary_still_returns_a_report(client, stub_repository):
    """A Partial Report: the metrics stand on their own when Claude can't be had."""
    response = client.post(
        "/analyze",
        json={"repo_url": "https://github.com/owner/repo"},
        headers={"X-Internal-Secret": SECRET},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ai_summary"] is None
    assert body["health_score"] == health_score(stub_repository)
    assert body["metrics"]["has_tests"] is False
    assert body["analysis_scope"]["total_files_seen"] == 120


def test_a_successful_summary_is_returned_alongside_the_metrics(
    client, stub_repository, monkeypatch
):
    async def fake_summary(repo_url, metrics, score, scope, settings):
        return AISummary(
            strengths=["Clear module boundaries"],
            risks=["No test suite"],
            suggestions=["Add CI"],
        )

    monkeypatch.setattr(analyzer, "generate_summary", fake_summary)

    response = client.post(
        "/analyze",
        json={"repo_url": "https://github.com/owner/repo"},
        headers={"X-Internal-Secret": SECRET},
    )

    body = response.json()
    assert body["ai_summary"]["risks"] == ["No test suite"]
    # The score is the formula's, unchanged by the summary's arrival.
    assert body["health_score"] == health_score(stub_repository)


def test_an_invalid_url_is_reported_clearly(client):
    response = client.post(
        "/analyze",
        json={"repo_url": "https://gitlab.com/owner/repo"},
        headers={"X-Internal-Secret": SECRET},
    )

    assert response.status_code == 400
    assert "github.com" in response.json()["detail"]
