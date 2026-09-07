-- The Health Score's activity window (`app.metrics.ACTIVITY_WINDOW_DAYS`) was
-- stated twice, in two languages, with nothing connecting them: the backend
-- constant, and the frontend's hard-coded "Commits (last 90 days)" label.
-- Retuning the window was a one-line backend change that would silently
-- mislabel every Report page, including Reports already saved under the old
-- window (issue #41).
--
-- Fixed by shipping `activity_window_days` on `Metrics`
-- (`backend/app/models.py`), alongside `commits_in_window`, the value it
-- parametrizes -- the same self-describing-Report principle ADR-0006
-- established for Component Weights. `metrics` is a single jsonb column
-- (migration 0001), so the new field needs no column of its own; only a
-- backfill so existing rows disclose the window they were actually computed
-- with, rather than reading as if they'd never been measured.
update public.reports
  set metrics = jsonb_set(metrics, '{activity_window_days}', '90', true)
  where not (metrics ? 'activity_window_days');
