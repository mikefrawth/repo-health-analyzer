/**
 * Stripe's webhook endpoint. Verifies the request actually came from Stripe
 * (the raw body's signature, not just its shape) before touching anything --
 * a subscription's active/canceled status and every credit grant on this app
 * originate only from here, never from the client-side checkout redirect.
 */

import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { requireEnv } from "@/lib/env";
import { stripeClient } from "@/lib/stripe";
import { handleStripeEvent, liveWebhookDeps } from "@/lib/stripe-webhook";

export async function POST(request: Request): Promise<NextResponse> {
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(body, signature, requireEnv("STRIPE_WEBHOOK_SECRET"));
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handleStripeEvent(event, liveWebhookDeps());
  } catch (err) {
    console.error(`[stripe/webhook] failed to handle ${event.type}:`, err);
    // A 500 makes Stripe retry the delivery -- appropriate here, since the
    // failure is this app's (a DB write failing), not a bad event.
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
