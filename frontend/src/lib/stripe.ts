/**
 * Stripe client. Created lazily -- calling this is what actually requires
 * STRIPE_SECRET_KEY, so importing this module (or anything that imports it)
 * doesn't fail a build or a test run that never touches billing.
 */

import Stripe from "stripe";

import { requireEnv } from "./env";

export function stripeClient(): Stripe {
  // No explicit apiVersion: the SDK pins its own matching API version, and
  // this app has no existing Stripe account/webhook config to stay
  // compatible with.
  return new Stripe(requireEnv("STRIPE_SECRET_KEY"));
}
