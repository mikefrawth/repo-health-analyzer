-- Component Weights: the fixed weight (out of 100) each component carries in
-- the Health Score formula (backend/app/scoring.py's `WEIGHTS`), stored
-- alongside `component_scores` so a Report can compute a weighted
-- contribution without pairing it against a weight table that lives outside
-- the row. Unfiltered — always all seven keys, unlike `component_scores`.
--
-- Reports are immutable and the formula may change beneath them (ADR-0001),
-- so the weights are stored on the row rather than served as current config:
-- a Report stays self-describing even after a future reweight. See ADR-0006.
--
-- Additive: existing rows predate this column and have none; the app only
-- ever reads Reports created after this migration ships alongside it.

alter table public.reports
  add column if not exists component_weights jsonb not null default '{}'::jsonb;

alter table public.reports
  alter column component_weights drop default;
