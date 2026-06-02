import Stripe from "stripe";
import { getBillingEnv } from "@/lib/stripe/config";

/** Stripe API version pinned to the installed SDK typings. */
export const STRIPE_API_VERSION = "2026-05-27.dahlia" as const;

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripe) return stripe;
  const env = getBillingEnv();
  stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
  return stripe;
}
