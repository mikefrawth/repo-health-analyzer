-- Issue #39: a paying subscriber whose Target Repository happened to be
-- private was told "this used the free plan" (skipped_free_tier), because
-- the backend withholds AI Summary generation for any private repo (issue
-- #24) regardless of plan, and the two "never attempted" cases were never
-- told apart. `skipped_private_repo` is its own reason so the copy can stop
-- lying to subscribers.

alter table public.reports
  drop constraint if exists reports_ai_summary_reason_check;
alter table public.reports
  add constraint reports_ai_summary_reason_check
    check (ai_summary_reason in ('skipped_free_tier', 'skipped_private_repo', 'failed'));
