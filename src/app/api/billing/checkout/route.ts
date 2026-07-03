import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import {
  getBillingEnv,
  isPaidTier,
  isStripeConfigured,
  priceIdForTier,
} from "@/lib/stripe/config";
import { getStripe } from "@/lib/stripe/client";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CheckoutBodySchema = z.object({
  tier: z.enum(["plus", "pro", "max"]),
});

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return jsonError("Billing is not configured.", 503);
  }

  return withAuth(req, async ({ uid, email }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const parsed = CheckoutBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid checkout payload.", 400);
    }

    const tier = parsed.data.tier;
    if (!isPaidTier(tier)) {
      return jsonError("Invalid tier.", 400);
    }

    const env = getBillingEnv();
    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(uid, email);
    const priceId = priceIdForTier(tier, env);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.APP_URL}/app?billing=success`,
      cancel_url: `${env.APP_URL}/app?billing=canceled`,
      client_reference_id: uid,
      metadata: { firebaseUid: uid, tier },
      subscription_data: {
        metadata: { firebaseUid: uid, tier },
      },
    });

    if (!session.url) {
      return jsonError("Failed to create checkout session.", 500);
    }

    return jsonOk({ url: session.url });
  });
}
