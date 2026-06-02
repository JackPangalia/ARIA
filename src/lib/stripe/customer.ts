import { getStripe } from "@/lib/stripe/client";
import { getOrCreatePlan, updatePlanStripeFields } from "@/lib/plan/repository";

export async function getOrCreateStripeCustomer(
  uid: string,
  email: string | null
): Promise<string> {
  const plan = await getOrCreatePlan(uid);
  if (plan.stripeCustomerId) return plan.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { firebaseUid: uid },
  });

  await updatePlanStripeFields(uid, { stripeCustomerId: customer.id });
  return customer.id;
}
