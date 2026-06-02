import type Stripe from "stripe";
import { updatePlanFromStripe } from "@/lib/plan/repository";
import { resolveSubscriptionEntitlement } from "@/lib/stripe/subscription";

export async function syncPlanFromSubscription(
  uid: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const resolved = resolveSubscriptionEntitlement(subscription);
  await updatePlanFromStripe(uid, resolved);
}

export function firebaseUidFromMetadata(
  metadata: Stripe.Metadata | null | undefined
): string | null {
  const uid = metadata?.firebaseUid ?? metadata?.uid;
  return typeof uid === "string" && uid.length > 0 ? uid : null;
}
