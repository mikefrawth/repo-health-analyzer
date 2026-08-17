-- Component Scores: the per-category 0.0-1.0 measurements `health_score` was
-- computed from (see backend/app/scoring.py's `component_scores`), exposed so
-- a Report can disclose why its Health Score is what it is. A category with
-- no Component Score is simply absent from the JSON object — never a 0.0.
--
-- Additive: existing rows predate this column and have none; the app only
-- ever reads Reports created after this migration ships alongside it.

alter table public.reports
  add column if not exists component_scores jsonb not null default '{}'::jsonb;

alter table public.reports
  alter column component_scores drop default;
