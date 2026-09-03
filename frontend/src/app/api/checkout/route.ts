/**
 * Starts a Stripe Checkout session for the app's single subscription plan.
 * POST-only, driven by a plain form (see AuthControls' logout and the
 * visibility toggle for the same low-JS pattern) -- nothing here grants a
 * subscription or credits itself; that only ever happens once Stripe's
 * webhook confirms payment.
 */

import { NextResponse } from "next/server";

import { requireEnv } from "@/lib/env";
import { stripeClient } from "@/lib/stripe";
import { currentUser } from "@/lib/supabase-server";

export async function POST(request: Request): Promise<NextResponse> {
  const { origin } = new URL(request.url);
  const user = await currentUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  const session = await stripeClient().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: requireEnv("STRIPE_PRICE_ID"), quantity: 1 }],
    // The webhook's only way to attribute a completed checkout back to a
    // signed-in user -- see stripe-webhook.ts's handleCheckoutSessionCompleted.
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    success_url: `${origin}/?checkout=success`,
    cancel_url: `${origin}/?checkout=canceled`,
  });

  if (!session.url) {
    console.error("[api/checkout] Stripe did not return a Checkout URL");
    return NextResponse.redirect(`${origin}/?checkout=error`);
  }

  // 303: the browser's follow-up request must be a GET, not a repeat POST.
  return NextResponse.redirect(session.url, { status: 303 });
}
