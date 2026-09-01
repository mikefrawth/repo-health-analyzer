"""The pure per-IP daily limit, pinned with plain inputs/outputs."""

import pytest
from app.config import Settings
from app.errors import AnalysisError
from app.rate_limit import RequestCounter, enforce_anonymous_rate_limit


def test_requests_under_the_threshold_are_allowed():
    settings = Settings(anonymous_daily_request_limit=3)
    counter = RequestCounter()

    for _ in range(3):
        enforce_anonymous_rate_limit("1.2.3.4", settings, counter)


def test_a_request_over_the_threshold_is_rejected_with_a_distinct_error():
    settings = Settings(anonymous_daily_request_limit=3)
    counter = RequestCounter()
    counter.increment("1.2.3.4")
    counter.increment("1.2.3.4")
    counter.increment("1.2.3.4")

    with pytest.raises(AnalysisError) as excinfo:
        enforce_anonymous_rate_limit("1.2.3.4", settings, counter)

    assert excinfo.value.status_code == 429


def test_each_ip_has_its_own_count():
    settings = Settings(anonymous_daily_request_limit=1)
    counter = RequestCounter()

    enforce_anonymous_rate_limit("1.2.3.4", settings, counter)
    # A different IP isn't affected by the first one's usage.
    enforce_anonymous_rate_limit("5.6.7.8", settings, counter)
