import { getStripe } from "@/lib/stripe/client";
import { isStripeConfigured } from "@/lib/stripe/config";

export interface StripeTeardownIds {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

/** Stripe throws typed errors; already-gone resources count as torn down. */
function isResourceMissing(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "resource_missing"
  );
}

/**
 * Cancels the user's subscription and deletes their Stripe customer as part of
 * account deletion. MUST run before the Firestore user subtree is deleted — the
 * plan doc is the only record linking the uid to its Stripe customer, so once
 * it's gone an active subscription can never be reconciled and bills forever.
 *
 * Throws on real Stripe failures so the caller aborts the deletion and the user
 * can retry; swallowing an error here would recreate the orphaned-billing bug.
 */
export async function teardownStripeForUser(
  ids: StripeTeardownIds
): Promise<void> {
  if (!isStripeConfigured()) return;
  if (!ids.stripeCustomerId && !ids.stripeSubscriptionId) return;

  const stripe = getStripe();

  if (ids.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(ids.stripeSubscriptionId);
    } catch (err) {
      if (!isResourceMissing(err)) throw err;
    }
  }

  if (ids.stripeCustomerId) {
    try {
      await stripe.customers.del(ids.stripeCustomerId);
    } catch (err) {
      if (!isResourceMissing(err)) throw err;
    }
  }
}
