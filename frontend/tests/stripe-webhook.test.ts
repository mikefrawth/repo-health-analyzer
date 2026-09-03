import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import { handleStripeEvent, monthlyCreditAmount, type StripeWebhookDeps } from "@/lib/stripe-webhook";

/**
 * Synthetic, schema-valid Stripe event payloads -- no live Stripe call
 * anywhere in this file, per the ticket's testing decisions. Each test
 * injects fake dependencies instead of touching Supabase or Stripe's API.
 */
function makeEvent(type: string, object: unknown): Stripe.Event {
  return { type, data: { object } } as unknown as Stripe.Event;
}

function makeDeps(): StripeWebhookDeps & {
  getSubscriptionPeriod: ReturnType<typeof vi.fn>;
  findUserIdBySubscription: ReturnType<typeof vi.fn>;
  upsertSubscription: ReturnType<typeof vi.fn>;
  updateSubscriptionStatus: ReturnType<typeof vi.fn>;
  grantMonthlyCredits: ReturnType<typeof vi.fn>;
} {
  return {
    getSubscriptionPeriod: vi.fn(),
    findUserIdBySubscription: vi.fn(),
    upsertSubscription: vi.fn(),
    updateSubscriptionStatus: vi.fn(),
    grantMonthlyCredits: vi.fn(),
  };
}

describe("monthlyCreditAmount", () => {
  it("defaults to 20 when STRIPE_MONTHLY_CREDITS is unset", () => {
    delete process.env.STRIPE_MONTHLY_CREDITS;
    expect(monthlyCreditAmount()).toBe(20);
  });

  it("reads a configured positive integer", () => {
    process.env.STRIPE_MONTHLY_CREDITS = "50";
    expect(monthlyCreditAmount()).toBe(50);
    delete process.env.STRIPE_MONTHLY_CREDITS;
  });

  it("falls back to the default for a non-numeric or non-positive value", () => {
    process.env.STRIPE_MONTHLY_CREDITS = "not-a-number";
    expect(monthlyCreditAmount()).toBe(20);
    process.env.STRIPE_MONTHLY_CREDITS = "-5";
    expect(monthlyCreditAmount()).toBe(20);
    delete process.env.STRIPE_MONTHLY_CREDITS;
  });
});

describe("handleStripeEvent: checkout.session.completed", () => {
  it("links the subscription to the user and grants that period's credits", async () => {
    const deps = makeDeps();
    deps.getSubscriptionPeriod.mockResolvedValue({
      status: "active",
      current_period_start: "2026-09-01T00:00:00.000Z",
      current_period_end: "2026-10-01T00:00:00.000Z",
    });

    const event = makeEvent("checkout.session.completed", {
      client_reference_id: "user-1",
      customer: "cus_123",
      subscription: "sub_123",
    });

    await handleStripeEvent(event, deps);

    expect(deps.getSubscriptionPeriod).toHaveBeenCalledWith("sub_123");
    expect(deps.upsertSubscription).toHaveBeenCalledWith({
      user_id: "user-1",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      status: "active",
      current_period_start: "2026-09-01T00:00:00.000Z",
      current_period_end: "2026-10-01T00:00:00.000Z",
    });
    expect(deps.grantMonthlyCredits).toHaveBeenCalledWith({
      user_id: "user-1",
      amount: 20,
      billing_period_start: "2026-09-01T00:00:00.000Z",
      billing_period_end: "2026-10-01T00:00:00.000Z",
    });
  });

  it("resolves nested customer/subscription objects to their ids", async () => {
    const deps = makeDeps();
    deps.getSubscriptionPeriod.mockResolvedValue({
      status: "active",
      current_period_start: "2026-09-01T00:00:00.000Z",
      current_period_end: "2026-10-01T00:00:00.000Z",
    });

    const event = makeEvent("checkout.session.completed", {
      client_reference_id: "user-1",
      customer: { id: "cus_123" },
      subscription: { id: "sub_123" },
    });

    await handleStripeEvent(event, deps);

    expect(deps.getSubscriptionPeriod).toHaveBeenCalledWith("sub_123");
    expect(deps.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_customer_id: "cus_123", stripe_subscription_id: "sub_123" }),
    );
  });

  it("does nothing when the session carries no client_reference_id -- can't attribute a user", async () => {
    const deps = makeDeps();
    const event = makeEvent("checkout.session.completed", {
      client_reference_id: null,
      customer: "cus_123",
      subscription: "sub_123",
    });

    await handleStripeEvent(event, deps);

    expect(deps.upsertSubscription).not.toHaveBeenCalled();
    expect(deps.grantMonthlyCredits).not.toHaveBeenCalled();
  });
});

describe("handleStripeEvent: invoice.paid", () => {
  it("renews the period and grants credits for a subscription this app already knows", async () => {
    const deps = makeDeps();
    deps.findUserIdBySubscription.mockResolvedValue("user-1");

    const event = makeEvent("invoice.paid", {
      subscription: "sub_123",
      customer: "cus_123",
      lines: {
        data: [{ period: { start: 1759276800, end: 1761955200 } }],
      },
    });

    await handleStripeEvent(event, deps);

    expect(deps.findUserIdBySubscription).toHaveBeenCalledWith("sub_123");
    expect(deps.upsertSubscription).toHaveBeenCalledWith({
      user_id: "user-1",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      status: "active",
      current_period_start: new Date(1759276800 * 1000).toISOString(),
      current_period_end: new Date(1761955200 * 1000).toISOString(),
    });
    expect(deps.grantMonthlyCredits).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", amount: 20 }),
    );
  });

  it("does nothing for a subscription this app has no record of", async () => {
    const deps = makeDeps();
    deps.findUserIdBySubscription.mockResolvedValue(null);

    const event = makeEvent("invoice.paid", {
      subscription: "sub_unknown",
      customer: "cus_123",
      lines: { data: [{ period: { start: 1759276800, end: 1761955200 } }] },
    });

    await handleStripeEvent(event, deps);

    expect(deps.upsertSubscription).not.toHaveBeenCalled();
    expect(deps.grantMonthlyCredits).not.toHaveBeenCalled();
  });
});

describe("handleStripeEvent: customer.subscription.updated", () => {
  it("syncs status and period dates for a known subscription", async () => {
    const deps = makeDeps();
    deps.findUserIdBySubscription.mockResolvedValue("user-1");

    const event = makeEvent("customer.subscription.updated", {
      id: "sub_123",
      customer: "cus_123",
      status: "past_due",
      current_period_start: 1759276800,
      current_period_end: 1761955200,
    });

    await handleStripeEvent(event, deps);

    expect(deps.upsertSubscription).toHaveBeenCalledWith({
      user_id: "user-1",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      status: "past_due",
      current_period_start: new Date(1759276800 * 1000).toISOString(),
      current_period_end: new Date(1761955200 * 1000).toISOString(),
    });
  });

  it("maps Stripe's trialing/unpaid statuses onto this app's three-value status", async () => {
    const deps = makeDeps();
    deps.findUserIdBySubscription.mockResolvedValue("user-1");

    await handleStripeEvent(
      makeEvent("customer.subscription.updated", {
        id: "sub_123",
        customer: "cus_123",
        status: "trialing",
        current_period_start: 1759276800,
        current_period_end: 1761955200,
      }),
      deps,
    );
    expect(deps.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));

    await handleStripeEvent(
      makeEvent("customer.subscription.updated", {
        id: "sub_123",
        customer: "cus_123",
        status: "unpaid",
        current_period_start: 1759276800,
        current_period_end: 1761955200,
      }),
      deps,
    );
    expect(deps.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ status: "past_due" }));

    await handleStripeEvent(
      makeEvent("customer.subscription.updated", {
        id: "sub_123",
        customer: "cus_123",
        status: "incomplete_expired",
        current_period_start: 1759276800,
        current_period_end: 1761955200,
      }),
      deps,
    );
    expect(deps.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ status: "canceled" }));
  });
});

describe("handleStripeEvent: customer.subscription.deleted", () => {
  it("marks the subscription canceled", async () => {
    const deps = makeDeps();
    const event = makeEvent("customer.subscription.deleted", { id: "sub_123" });

    await handleStripeEvent(event, deps);

    expect(deps.updateSubscriptionStatus).toHaveBeenCalledWith("sub_123", "canceled");
  });
});

describe("handleStripeEvent: invoice.payment_failed", () => {
  it("marks the subscription past_due", async () => {
    const deps = makeDeps();
    const event = makeEvent("invoice.payment_failed", { subscription: "sub_123" });

    await handleStripeEvent(event, deps);

    expect(deps.updateSubscriptionStatus).toHaveBeenCalledWith("sub_123", "past_due");
  });

  it("does nothing when the invoice has no subscription", async () => {
    const deps = makeDeps();
    const event = makeEvent("invoice.payment_failed", { subscription: null });

    await handleStripeEvent(event, deps);

    expect(deps.updateSubscriptionStatus).not.toHaveBeenCalled();
  });
});

describe("handleStripeEvent: unhandled event types", () => {
  it("resolves without calling any dependency", async () => {
    const deps = makeDeps();
    const event = makeEvent("customer.updated", { id: "cus_123" });

    await expect(handleStripeEvent(event, deps)).resolves.toBeUndefined();

    expect(deps.upsertSubscription).not.toHaveBeenCalled();
    expect(deps.updateSubscriptionStatus).not.toHaveBeenCalled();
    expect(deps.grantMonthlyCredits).not.toHaveBeenCalled();
  });
});
