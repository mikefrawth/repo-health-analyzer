-- Issue #37: the analyze route retries refundCreditForReport up to three
-- times (subscriptions-repo.ts), but nothing stopped a retry after a lost
-- response from inserting a second refund row for the same Report -- the
-- user ends the billing period a credit up for a Partial Report they were
-- never charged for.
--
-- Mirrors credit_ledger_one_monthly_grant_per_period_idx (migration 0006):
-- one refund and one consume per Report, enforced at the database level so
-- a retried write can collapse into a no-op instead of double-crediting.
create unique index if not exists credit_ledger_one_refund_per_report_idx
  on public.credit_ledger (report_id)
  where reason = 'refund';

create unique index if not exists credit_ledger_one_consume_per_report_idx
  on public.credit_ledger (report_id)
  where reason = 'detailed_report_consume';
