import { describe, expect, it, vi } from "vitest";

/**
 * Issue #37: consumeCreditForReport/refundCreditForReport are retried by the
 * analyze route, so a second insert for a Report that already has one must
 * collapse into a no-op -- not surface as an error -- the same way
 * grantMonthlyCredits already treats a redelivered monthly_grant.
 */

const insert = vi.fn();

vi.mock("@/lib/supabase", () => ({
  CREDIT_LEDGER_TABLE: "credit_ledger",
  SUBSCRIPTIONS_TABLE: "subscriptions",
  serviceRoleClient: () => ({
    from: () => ({ insert }),
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
