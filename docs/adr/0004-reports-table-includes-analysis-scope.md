# The `reports` table carries an `analysis_scope` column the original spec's table sketch omitted

The original spec's sketch of the `reports` table (`repo-health-analyzer-spec.md`) only listed `metrics`, `health_score`, and `ai_summary`. The frontend migration (`frontend/supabase/migrations/0001_create_reports.sql`, commit `be64ae5`) adds a fourth column, `analysis_scope jsonb not null`, storing the backend's `AnalysisScope` verbatim.

Reasoning: the backend already returns `analysis_scope` in `AnalyzeResponse` so a caller can tell whether a large Target Repository was fully inspected or sampled down to `max_files` (see `docs/specs/0001-analyze-endpoint-and-health-score.md`). Dropping that field at the Supabase write would let a Report understate what it actually measured — a saved Report claiming a Health Score without disclosing that it was computed from a sample isn't honest about its own basis. Persisting it costs nothing extra: it's already part of the backend's response shape, so no new computation or fetch is introduced, only a column to keep the value the frontend already receives.

Trade-off: none identified — this is an additive, non-destructive column consistent with the table's other `jsonb` fields (`metrics`, `ai_summary`), and no existing spec behavior depends on the table sketch being exhaustive.
