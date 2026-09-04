-- Distinguish "AI Summary skipped, free tier" from "AI Summary failed"
-- (issue #25). Today's single ambiguous `ai_summary is null` state can't
-- tell a subscriber's failed (and refunded) attempt apart from a free-tier
-- request that never asked for one at all.

alter table public.reports
  add column if not exists ai_summary_reason text
    check (ai_summary_reason in ('skipped_free_tier', 'failed'));

-- Backfill pre-migration Partial Reports so the constraint below doesn't
-- reject every existing row that has no summary and, until now, had no
-- reason for it either. Every such row predates this feature, so
-- 'skipped_free_tier' is the correct reason regardless of why the summary
-- was actually missing.
update public.reports
  set ai_summary_reason = 'skipped_free_tier'
  where ai_summary is null and ai_summary_reason is null;

-- A reason exists exactly when there's no summary to explain -- never both,
-- never neither.
alter table public.reports
  drop constraint if exists reports_ai_summary_reason_matches_ai_summary;
alter table public.reports
  add constraint reports_ai_summary_reason_matches_ai_summary
  check ((ai_summary is null) = (ai_summary_reason is not null));
