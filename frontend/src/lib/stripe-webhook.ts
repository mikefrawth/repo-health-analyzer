/**
 * Stripe webhook event handling, split from the route handler at the same
 * explicit-dependency boundary this repo already uses for the backend's
 * `fetch_repo_metadata`/`generate_summary` -- so a test can drive it with a
 * synthetic, schema-valid event and fake dependencies, with no live Stripe
 * or database call (see the ticket's testing decisions).
 *
 * `getSubscriptionPeriod` is the one dependency that makes a real Stripe API
 * call in production: a Checkout Session webhook payload doesn't carry the
 * subscription's period dates itself, so linking a freshly-completed
 * checkout to its billing period requires fetching the subscription object.
 * Every other event here carries what it needs directly on its payload.
 */

import type Stripe from "stripe";

import { stripeClient } from "./stripe";
import type { SubscriptionStatus } from "./subscription";
import {
  findUserIdBySubscription,
  grantMonthlyCredits,
  updateSubscriptionStatus,
  upsertSubscription,
} from "./subscriptions-repo";

/**
 * How many credits a successful billing period grants. A business/finance
 * decision (see the ticket's "Out of Scope"), left as a config knob rather
 * than hard-coded engineering policy -- defaults to 20 for local dev/test.
 */
export function monthlyCreditAmount(): number {
  const raw = process.env.STRIPE_MONTHLY_CREDITS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

export type BillingPeriod = {
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
};

export type StripeWebhookDeps = {
  getSubscriptionPeriod: (subscriptionId: string) => Promise<BillingPeriod>;
  findUserIdBySubscription: typeof findUserIdBySubscription;
  upsertSubscription: typeof upsertSubscription;
  updateSubscriptionStatus: typeof updateSubscriptionStatus;
  grantMonthlyCredits: typeof grantMonthlyCredits;
};

export function liveWebhookDeps(): StripeWebhookDeps {
  return {
    getSubscriptionPeriod: async (subscriptionId) => {
      const subscription = await stripeClient().subscriptions.retrieve(subscriptionId);
      return {
        status: mapStripeStatus(subscription.status),
        current_period_start: unixToIso(subscription.current_period_start),
        current_period_end: unixToIso(subscription.current_period_end),
      };
    },
    findUserIdBySubscription,
    upsertSubscription,
    updateSubscriptionStatus,
    grantMonthlyCredits,
  };
}

/**
 * Stripe's subscription status has more values than this app tracks:
 * `trialing` behaves like `active` (there's no separate trial handling in
 * v1), and `incomplete`/`incomplete_expired`/`unpaid` all mean "not
 * currently granting credits" -- `unpaid` maps to `past_due` (a failed
 * payment, potentially recoverable), everything else to `canceled`.
 */
function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === "active" || status === "trialing") {
    return "active";
  }
  if (status === "past_due" || status === "unpaid") {
    return "past_due";
  }
  return "canceled";
}

function unixToIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

/** A Stripe id field that may come back as a bare string or an expanded object. */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return typeof value === "string" ? value : value.id;
}

export async function handleStripeEvent(event: Stripe.Event, deps: StripeWebhookDeps): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutSessionCompleted(event, deps);
    case "invoice.paid":
      return handleInvoicePaid(event, deps);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(event, deps);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event, deps);
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(event, deps);
    default:
      // Every other event type is irrelevant to billing state -- ignored,
      // not an error.
      return;
  }
}

async function handleCheckoutSessionCompleted(
  event: Stripe.Event,
  deps: StripeWebhookDeps,
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.client_reference_id;
  const subscriptionId = idOf(session.subscription as string | { id: string } | null);
  const customerId = idOf(session.customer as string | { id: string } | null);

  if (!userId || !subscriptionId || !customerId) {
    console.error(
      "[stripe-webhook] checkout.session.completed missing client_reference_id, subscription, or customer",
    );
    return;
  }

  const period = await deps.getSubscriptionPeriod(subscriptionId);
  await deps.upsertSubscription({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    ...period,
  });
  await deps.grantMonthlyCredits({
    user_id: userId,
    amount: monthlyCreditAmount(),
    billing_period_start: period.current_period_start,
    billing_period_end: period.current_period_end,
  });
}

async function handleInvoicePaid(event: Stripe.Event, deps: StripeWebhookDeps): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = idOf(invoice.subscription as string | { id: string } | null);
  const customerId = idOf(invoice.customer as string | { id: string } | null);
  const period = invoice.lines.data[0]?.period;

  if (!subscriptionId || !customerId || !period) {
    console.error("[stripe-webhook] invoice.paid missing subscription, customer, or line period");
    return;
  }

  const userId = await deps.findUserIdBySubscription(subscriptionId);
  if (!userId) {
    console.error(`[stripe-webhook] invoice.paid for unknown subscription ${subscriptionId}`);
    return;
  }

  const billingPeriod: BillingPeriod = {
    status: "active",
    current_period_start: unixToIso(period.start),
    current_period_end: unixToIso(period.end),
  };
  await deps.upsertSubscription({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    ...billingPeriod,
  });
  await deps.grantMonthlyCredits({
    user_id: userId,
    amount: monthlyCreditAmount(),
    billing_period_start: billingPeriod.current_period_start,
    billing_period_end: billingPeriod.current_period_end,
  });
}

async function handleSubscriptionUpdated(event: Stripe.Event, deps: StripeWebhookDeps): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = idOf(subscription.customer as string | { id: string } | null);
  if (!customerId) {
    console.error("[stripe-webhook] customer.subscription.updated missing customer id");
    return;
  }

  const userId = await deps.findUserIdBySubscription(subscription.id);
  if (!userId) {
    console.error(`[stripe-webhook] customer.subscription.updated for unknown subscription ${subscription.id}`);
    return;
  }

  await deps.upsertSubscription({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    status: mapStripeStatus(subscription.status),
    current_period_start: unixToIso(subscription.current_period_start),
    current_period_end: unixToIso(subscription.current_period_end),
  });
}

async function handleSubscriptionDeleted(event: Stripe.Event, deps: StripeWebhookDeps): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  await deps.updateSubscriptionStatus(subscription.id, "canceled");
}

async function handleInvoicePaymentFailed(event: Stripe.Event, deps: StripeWebhookDeps): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = idOf(invoice.subscription as string | { id: string } | null);
  if (!subscriptionId) {
    return;
  }
  await deps.updateSubscriptionStatus(subscriptionId, "past_due");
}
