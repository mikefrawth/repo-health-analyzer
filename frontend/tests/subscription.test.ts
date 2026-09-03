import { describe, expect, it } from "vitest";

import { creditBalance } from "@/lib/subscription";

describe("creditBalance", () => {
  it("sums entries tagged with the current period", () => {
    const entries = [
      { amount: 20, billing_period_start: "2026-09-01T00:00:00.000Z" },
      { amount: -1, billing_period_start: "2026-09-01T00:00:00.000Z" },
      { amount: -1, billing_period_start: "2026-09-01T00:00:00.000Z" },
    ];
    expect(creditBalance(entries, "2026-09-01T00:00:00.000Z")).toBe(18);
  });

  it("ignores entries from a past period -- credits don't roll over", () => {
    const entries = [
      { amount: 20, billing_period_start: "2026-08-01T00:00:00.000Z" },
      { amount: -3, billing_period_start: "2026-08-01T00:00:00.000Z" },
      { amount: 20, billing_period_start: "2026-09-01T00:00:00.000Z" },
    ];
    expect(creditBalance(entries, "2026-09-01T00:00:00.000Z")).toBe(20);
  });

  it("returns 0 for a period with no entries", () => {
    expect(creditBalance([], "2026-09-01T00:00:00.000Z")).toBe(0);
  });

  it("is a plain sum, with no floor at zero", () => {
    // A negative balance shouldn't happen given #25's credit-gating decision,
    // but that's a property of the gating function, not of this arithmetic.
    const entries = [
      { amount: 20, billing_period_start: "2026-09-01T00:00:00.000Z" },
      { amount: -25, billing_period_start: "2026-09-01T00:00:00.000Z" },
    ];
    expect(creditBalance(entries, "2026-09-01T00:00:00.000Z")).toBe(-5);
  });
});
