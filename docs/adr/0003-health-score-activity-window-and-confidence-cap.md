# Commit activity uses a trailing window; the score is capped by measurement confidence

A throwaway logic prototype (`backend/prototypes/health-score-formula.PROTOTYPE.html`, see [ADR-0001](0001-deterministic-health-score.md)) drove the deterministic Health Score formula through several repository shapes before any real repo had exercised it, and surfaced two defects the formula's description didn't reveal:

**Commit activity measured history, not activity.** `commits_in_window` counted every commit present in the shallow clone with no reference to when it happened, so a repository last touched three years ago still scored full marks on activity purely for having 50 commits in its history. Fixed: `count_recent_commits` (`backend/app/metrics.py`) now counts only commits within a trailing 90-day window. A dead repository now scores zero on both commit signals instead of just one.

**Renormalisation let an unmeasurable repository outscore a fully-measured one.** When a component can't be measured (no dependency manifest, no supported complexity analyser), its weight is dropped and the rest are scaled up — by design, so an unsupported language isn't penalised. But scaling alone meant a repository we could barely inspect could still reach a perfect 100. Fixed: `confidence_cap` (`backend/app/scoring.py`) ceilings the score in proportion to how much weight was actually measured, so the top of the range is reserved for repositories we actually looked at. Renormalisation itself is unchanged — an unsupported language still isn't scored as a failure, it just can't reach 100 either.

Both fixes are pinned by tests in `backend/tests/test_scoring.py` and `test_metrics.py`.
