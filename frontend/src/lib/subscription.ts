/**
 * Pure billing-period arithmetic, independent of any live Stripe or database
 * call -- so it can be pinned with plain input/output tests the same way
 * `report.ts`'s `canBeMadePublic` is.
 */

export type SubscriptionStatus = "active" | "canceled" | "past_due";

export type LedgerEntry = {
  amount: number;
  billing_period_start: string;
};

/**
 * The current period's balance: the sum of every ledger entry tagged with
 * this exact period start. An entry from a past period never contributes --
 * credits don't roll over (see credit_ledger's billing_period_start column
 * and ADR-0009), so a stale row simply falls outside the filter rather than
 * needing separate cleanup.
 */
export function creditBalance(entries: LedgerEntry[], currentPeriodStart: string): number {
  return entries
    .filter((entry) => entry.billing_period_start === currentPeriodStart)
    .reduce((total, entry) => total + entry.amount, 0);
}

/**
 * Issue #25: may this requester's analyze call spend a credit on a detailed
 * Report (the AI Summary)? Pure and independently testable, with no live
 * Stripe/Supabase call -- `status`/`remainingCredits` are already-fetched
 * facts, not something this function goes and gets.
 *
 * `status: null` covers both "never subscribed" and "signed out" -- either
 * way there is no credit balance to spend.
 */
export function canRequestDetailedReport(
  status: SubscriptionStatus | null,
  remainingCredits: number,
): boolean {
  return status === "active" && remainingCredits > 0;
}
