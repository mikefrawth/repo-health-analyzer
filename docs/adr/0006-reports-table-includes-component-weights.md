# `AnalyzeResponse` and the `reports` table carry `component_weights`, closing ADR-0005's deferred trade-off

[ADR-0005](0005-reports-table-includes-component-scores.md) shipped `component_scores` — the per-category 0.0-1.0 values `health_score` was computed from — but left their **weights** out. A reader that wanted each component's weighted contribution had to pair `component_scores` with `WEIGHTS`, which lived only in `backend/app/scoring.py` and was mirrored by hand as literals in `frontend/src/lib/metrics-display.ts`'s `COMPONENTS` table. The two copies agreed only because nobody had reweighted the formula yet; a backend reweight would make the Component Scores chart silently wrong, with nothing failing — exactly the drift [ADR-0001](0001-deterministic-health-score.md) exists to prevent.

## Decision

`AnalyzeResponse` gains `component_weights: dict[ComponentKey, int]` (`backend/app/models.py`), populated directly from `app.scoring.WEIGHTS` (`backend/app/analyzer.py`) — unfiltered, always all seven keys, unlike `component_scores` which drops unmeasured components. The frontend's `COMPONENTS` table is retired; `frontend/src/lib/metrics-display.ts` now keeps only display labels (`COMPONENT_LABELS`), and `componentScoreChartData` takes weights as a parameter sourced from the response. No weight literal remains in `frontend/`.

Both backend and frontend also gained a key type — `ComponentKey` (a `Literal` in Python, a string union in TypeScript) — so a typo'd or retired component key fails typechecking instead of silently drifting out of sync between the formula, the response, and the chart.

## Trade-off: stored on the row, not served as current config

Ticket #14 posed this as an open question. The weights are stored on each Report row (`frontend/supabase/migrations/0003_add_component_weights.sql` adds `component_weights jsonb`) rather than read separately as live backend config. Reasoning: Reports are immutable and the formula may change beneath them (ADR-0001), so a Report that only referenced current config would start disclosing the *wrong* weights for its own score the moment a reweight shipped. Storing what `AnalyzeResponse` returned at analysis time keeps a Report self-describing forever, the same argument ADR-0004 and ADR-0005 already made for `analysis_scope` and `component_scores`. The cost is a third additive `jsonb` column of the same shape as those two.
