import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import {
  getBillingEnv,
  isPaidTier,
  isStripeConfigured,
  priceIdForTier,
  priceIdForTopUp,
} from "@/lib/stripe/config";
import { getStripe } from "@/lib/stripe/client";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { TOP_UP_PACKS } from "@/lib/plan/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SubscriptionCheckoutSchema = z.object({
  type: z.literal("subscription").optional(),
  tier: z.enum(["pro", "power", "plus", "max", "sigma"]),
  interval: z.enum(["month", "year"]).optional().default("month"),
});

const TopUpCheckoutSchema = z.object({
  type: z.literal("topup"),
  packId: z.enum(["starter_5h", "pro_12h"]),
});

const CheckoutBodySchema = z.union([TopUpCheckoutSchema, SubscriptionCheckoutSchema]);

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

    const env = getBillingEnv();
    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(uid, email);

    if (parsed.data.type === "topup") {
      const packId = parsed.data.packId;
      const pack = TOP_UP_PACKS[packId];
      if (!pack) {
        return jsonError("Invalid Top-Up pack.", 400);
      }

      const topUpPriceId = priceIdForTopUp(packId, env);
      const lineItems = topUpPriceId
        ? [{ price: topUpPriceId, quantity: 1 }]
        : [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: `Kivo ${pack.name}`,
                  description: pack.description,
                },
                unit_amount: Math.round(pack.priceUsd * 100),
              },
              quantity: 1,
            },
          ];

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        allow_promotion_codes: true,
        line_items: lineItems,
        success_url: `${env.APP_URL}/app?billing=topup_success`,
        cancel_url: `${env.APP_URL}/app?billing=topup_canceled`,
        client_reference_id: uid,
        metadata: {
          firebaseUid: uid,
          type: "topup",
          packId,
          secondsAdded: String(pack.secondsAdded),
        },
      });

      if (!session.url) {
        return jsonError("Failed to create checkout session.", 500);
      }

      return jsonOk({ url: session.url });
    }

    const { tier, interval } = parsed.data;
    if (!isPaidTier(tier)) {
      return jsonError("Invalid tier.", 400);
    }

    const priceId = priceIdForTier(tier, env, interval);
    if (!priceId) {
      return jsonError(`No price ID configured for ${tier} (${interval}).`, 500);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.APP_URL}/app?billing=success`,
      cancel_url: `${env.APP_URL}/app?billing=canceled`,
      client_reference_id: uid,
      metadata: { firebaseUid: uid, tier, interval },
      subscription_data: {
        metadata: { firebaseUid: uid, tier, interval },
      },
    });

    if (!session.url) {
      return jsonError("Failed to create checkout session.", 500);
    }

    return jsonOk({ url: session.url });
  });
}
