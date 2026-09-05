import { describe, expect, it, vi } from "vitest";

/**
 * Issue #37: consumeCreditForReport/refundCreditForReport are retried by the
 * analyze route, so a second insert for a Report that already has one must
 * collapse into a no-op -- not surface as an error -- the same way
 * grantMonthlyCredits already treats a redelivered monthly_grant.
 */

const insert = vi.fn();
const upsert = vi.fn();

vi.mock("@/lib/supabase", () => ({
  CREDIT_LEDGER_TABLE: "credit_ledger",
  SUBSCRIPTIONS_TABLE: "subscriptions",
  serviceRoleClient: () => ({
    from: () => ({ insert, upsert }),
  }),
}));

vi.mock("@/lib/supabase-server", () => ({
  serverClient: vi.fn(),
}));

const row = {
  user_id: "user-1",
  billing_period_start: "2026-09-01T00:00:00.000Z",
  billing_period_end: "2026-10-01T00:00:00.000Z",
  report_id: "report-1",
};

describe("refundCreditForReport", () => {
  it("succeeds on a fresh insert", async () => {
    insert.mockReset().mockResolvedValue({ error: null });
    const { refundCreditForReport } = await import("@/lib/subscriptions-repo");

    await expect(refundCreditForReport(row)).resolves.toBeUndefined();
  });

  it("treats a duplicate refund for the same Report as a no-op, not an error", async () => {
    insert.mockReset().mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const { refundCreditForReport } = await import("@/lib/subscriptions-repo");

    await expect(refundCreditForReport(row)).resolves.toBeUndefined();
  });

  it("still throws for a non-uniqueness error", async () => {
    insert.mockReset().mockResolvedValue({ error: { code: "08006", message: "connection failure" } });
    const { refundCreditForReport } = await import("@/lib/subscriptions-repo");

    await expect(refundCreditForReport(row)).rejects.toThrow("Could not refund credit for Report");
  });
});

describe("consumeCreditForReport", () => {
  it("treats a duplicate consume for the same Report as a no-op, not an error", async () => {
    insert.mockReset().mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const { consumeCreditForReport } = await import("@/lib/subscriptions-repo");

    await expect(consumeCreditForReport(row)).resolves.toBeUndefined();
  });
});

/**
 * Issue #35: a user who cancels and later resubscribes gets a brand-new
 * Stripe subscription id, but the schema (migration 0006) enforces one
 * subscription row per user via a `user_id` unique constraint. Conflicting
 * on `stripe_subscription_id` instead made the upsert attempt an INSERT for
 * that new id, which then violated the `user_id` constraint and 500'd the
 * webhook on every retry.
 */
describe("upsertSubscription", () => {
  const subscriptionRow = {
    user_id: "user-1",
    stripe_customer_id: "cus_123",
    stripe_subscription_id: "sub_B",
    status: "active" as const,
    current_period_start: "2026-09-01T00:00:00.000Z",
    current_period_end: "2026-10-01T00:00:00.000Z",
  };

  it("conflicts on user_id, not stripe_subscription_id, so a resubscribe updates the existing row in place", async () => {
    upsert.mockReset().mockResolvedValue({ error: null });
    const { upsertSubscription } = await import("@/lib/subscriptions-repo");

    await upsertSubscription(subscriptionRow);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining(subscriptionRow),
      { onConflict: "user_id" },
    );
  });

  it("still throws when the write fails for a reason other than the conflict target", async () => {
    upsert.mockReset().mockResolvedValue({ error: { code: "08006", message: "connection failure" } });
    const { upsertSubscription } = await import("@/lib/subscriptions-repo");

    await expect(upsertSubscription(subscriptionRow)).rejects.toThrow("Could not save subscription");
  });
});
