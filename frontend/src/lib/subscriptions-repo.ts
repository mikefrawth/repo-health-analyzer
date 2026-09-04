/**
 * Reading and writing subscriptions and the credit ledger.
 *
 * Mirrors reports-repo.ts's split: reads go through the session-aware client
 * so RLS resolves `auth.uid()` for the caller and narrows to their own rows;
 * every write here is the Stripe webhook's, and goes through the service
 * role, since no non-service-role write path exists for either table
 * (migration 0006).
 */

import { CREDIT_LEDGER_TABLE, SUBSCRIPTIONS_TABLE, serviceRoleClient } from "./supabase";
import { serverClient } from "./supabase-server";
import type { LedgerEntry, SubscriptionStatus } from "./subscription";

export type SubscriptionRow = {
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
};

/** The signed-in visitor's own subscription, or `null` if they have none. */
export async function fetchOwnSubscription(): Promise<SubscriptionRow | null> {
  const { data, error } = await serverClient()
    .from(SUBSCRIPTIONS_TABLE)
    .select("status, current_period_start, current_period_end")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load subscription: ${error.message}`);
  }
  return (data as SubscriptionRow | null) ?? null;
}

/** The signed-in visitor's own ledger entries for one billing period. */
export async function fetchOwnLedgerForPeriod(periodStart: string): Promise<LedgerEntry[]> {
  const { data, error } = await serverClient()
    .from(CREDIT_LEDGER_TABLE)
    .select("amount, billing_period_start")
    .eq("billing_period_start", periodStart);

  if (error) {
    throw new Error(`Could not load credit ledger: ${error.message}`);
  }
  return (data as LedgerEntry[] | null) ?? [];
}

/** Webhook-only: which user a Stripe subscription id belongs to, if any. */
export async function findUserIdBySubscription(
  stripeSubscriptionId: string,
): Promise<string | null> {
  const { data, error } = await serviceRoleClient()
    .from(SUBSCRIPTIONS_TABLE)
    .select("user_id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not look up subscription owner: ${error.message}`);
  }
  return (data?.user_id as string | undefined) ?? null;
}

/**
 * Webhook-only: create or refresh a user's subscription row, keyed on
 * Stripe's own subscription id so a redelivered event updates the same row
 * rather than duplicating it.
 */
export async function upsertSubscription(row: {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
}): Promise<void> {
  const { error } = await serviceRoleClient()
    .from(SUBSCRIPTIONS_TABLE)
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "stripe_subscription_id" });

  if (error) {
    throw new Error(`Could not save subscription: ${error.message}`);
  }
}

/**
 * Webhook-only: flip a subscription's status without touching its period
 * dates -- used for cancellation and payment-failure events, neither of
 * which hands us a fresh period to record.
 */
export async function updateSubscriptionStatus(
  stripeSubscriptionId: string,
  status: SubscriptionStatus,
): Promise<void> {
  const { error } = await serviceRoleClient()
    .from(SUBSCRIPTIONS_TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", stripeSubscriptionId);

  if (error) {
    throw new Error(`Could not update subscription status: ${error.message}`);
  }
}

/** Postgres's code for a violated unique constraint. */
const UNIQUE_VIOLATION = "23505";

/**
 * Webhook-only: grant a billing period's credits. Idempotent -- migration
 * 0006's partial unique index rejects a second monthly_grant for a period
 * this user already has one for (Stripe can redeliver the events that
 * trigger this), and that rejection is treated as a no-op here, not an
 * error.
 */
export async function grantMonthlyCredits(row: {
  user_id: string;
  amount: number;
  billing_period_start: string;
  billing_period_end: string;
}): Promise<void> {
  const { error } = await serviceRoleClient()
    .from(CREDIT_LEDGER_TABLE)
    .insert({
      user_id: row.user_id,
      amount: row.amount,
      reason: "monthly_grant",
      billing_period_start: row.billing_period_start,
      billing_period_end: row.billing_period_end,
    });

  if (error && error.code !== UNIQUE_VIOLATION) {
    throw new Error(`Could not grant monthly credits: ${error.message}`);
  }
}

type ReportCreditRow = {
  user_id: string;
  billing_period_start: string;
  billing_period_end: string;
  report_id: string;
};

/**
 * Issue #37: retried by the analyze route (a lost response can make a
 * successful insert look like a failure), so a second insert for the same
 * Report is expected, not exceptional. Migration 0008's partial unique
 * indexes reject it, and that rejection is treated as a no-op here, the same
 * way grantMonthlyCredits treats a redelivered monthly_grant.
 */
async function writeReportCreditEntry(
  row: ReportCreditRow,
  amount: 1 | -1,
  reason: "detailed_report_consume" | "refund",
  failureVerb: string,
): Promise<void> {
  const { error } = await serviceRoleClient()
    .from(CREDIT_LEDGER_TABLE)
    .insert({
      user_id: row.user_id,
      amount,
      reason,
      billing_period_start: row.billing_period_start,
      billing_period_end: row.billing_period_end,
      report_id: row.report_id,
    });

  if (error && error.code !== UNIQUE_VIOLATION) {
    throw new Error(`Could not ${failureVerb} credit for Report: ${error.message}`);
  }
}

/**
 * The analyze route's write, once it has decided (via
 * `canRequestDetailedReport`) to spend a credit on a detailed Report.
 * Service-role, like every other write to this table -- no non-service-role
 * write path exists (migration 0006).
 */
export async function consumeCreditForReport(row: ReportCreditRow): Promise<void> {
  await writeReportCreditEntry(row, -1, "detailed_report_consume", "consume");
}

/**
 * Issue #25: when a detailed Report's AI Summary generation fails after a
 * credit was already consumed, this is the offsetting entry that gives it
 * back -- an additional ledger row, never a retroactive edit to the consume
 * row or a direct balance mutation (see migration 0006's own note on why the
 * ledger is append-only).
 */
export async function refundCreditForReport(row: ReportCreditRow): Promise<void> {
  await writeReportCreditEntry(row, 1, "refund", "refund");
}
