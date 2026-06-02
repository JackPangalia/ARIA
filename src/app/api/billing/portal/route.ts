import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { getOrCreatePlan } from "@/lib/plan/repository";
import { getBillingEnv, isStripeConfigured } from "@/lib/stripe/config";
import { getStripe } from "@/lib/stripe/client";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return jsonError("Billing is not configured.", 503);
  }

  return withAuth(req, async ({ uid, email }) => {
    const plan = await getOrCreatePlan(uid);
    const customerId =
      plan.stripeCustomerId ?? (await getOrCreateStripeCustomer(uid, email));

    if (!customerId) {
      return jsonError("No billing account found.", 400);
    }

    const env = getBillingEnv();
    const stripe = getStripe();

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${env.APP_URL}/app`,
    });

    return jsonOk({ url: session.url });
  });
}
