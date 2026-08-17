-- Reports: the saved, immutable result of analyzing a Target Repository.
--
-- All Reports are public in this build (see repo-health-analyzer-spec.md — no
-- per-report privacy option), so anonymous SELECT is allowed. Writes are
-- restricted to the service role, which only the server-side /api/analyze route
-- holds: the anon key ships to the browser and must never be able to forge a
-- Report.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  repo_url text not null,
  metrics jsonb not null,
  health_score integer not null check (health_score between 0 and 100),
  -- Disclosed in the Report so a reader knows whether a large Target Repository
  -- was fully inspected or sampled. (The original project spec's table sketch
  -- omitted this column; the Report is not honest without it.)
  analysis_scope jsonb not null,
  -- null is a Partial Report: Metrics and Health Score succeeded, the AI
  -- Summary did not. A valid Report, not an error.
  ai_summary jsonb,
  created_at timestamptz not null default now()
);

-- The homepage lists the most recent Reports.
create index if not exists reports_created_at_idx on public.reports (created_at desc);

alter table public.reports enable row level security;

-- Public read. The service role bypasses RLS entirely, so it needs no policy;
-- the deliberate absence of any INSERT/UPDATE/DELETE policy is what keeps the
-- anon key read-only.
drop policy if exists "Reports are publicly readable" on public.reports;
create policy "Reports are publicly readable"
  on public.reports
  for select
  using (true);
