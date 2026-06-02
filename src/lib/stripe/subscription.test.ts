import { describe, expect, it } from "vitest";
import { resolveSubscriptionEntitlement } from "@/lib/stripe/subscription";
import type { BillingEnv } from "@/lib/stripe/config";
import type Stripe from "stripe";

const env: BillingEnv = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  STRIPE_PRICE_PLUS: "price_plus",
  STRIPE_PRICE_PRO: "price_pro",
  STRIPE_PRICE_MAX: "price_max",
  APP_URL: "http://localhost:3000",
};

function subscription(
  patch: Partial<Stripe.Subscription> & Pick<Stripe.Subscription, "status">
): Stripe.Subscription {
  return {
    id: "sub_test",
    object: "subscription",
    customer: "cus_test",
    cancel_at_period_end: false,
    current_period_start: Date.UTC(2026, 5, 15) / 1000,
    current_period_end: Date.UTC(2026, 6, 15) / 1000,
    items: {
      object: "list",
      data: [
        {
          id: "si_test",
          object: "subscription_item",
          price: { id: "price_pro", object: "price" } as Stripe.Price,
        } as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: "/v1/subscription_items",
    },
    metadata: { firebaseUid: "uid123" },
    ...patch,
  } as Stripe.Subscription;
}

describe("resolveSubscriptionEntitlement", () => {
  it("maps active pro subscription to pro tier", () => {
    const resolved = resolveSubscriptionEntitlement(subscription({ status: "active" }), env);
    expect(resolved.tier).toBe("pro");
    expect(resolved.stripePriceId).toBe("price_pro");
    expect(resolved.billingAnchorDay).toBe(15);
  });

  it("keeps paid tier during past_due", () => {
    const resolved = resolveSubscriptionEntitlement(subscription({ status: "past_due" }), env);
    expect(resolved.tier).toBe("pro");
  });

  it("downgrades canceled subscription to free", () => {
    const resolved = resolveSubscriptionEntitlement(subscription({ status: "canceled" }), env);
    expect(resolved.tier).toBe("free");
  });

  it("downgrades unknown price to free even when active", () => {
    const sub = subscription({ status: "active" });
    sub.items.data[0].price = { id: "price_unknown", object: "price" } as Stripe.Price;
    const resolved = resolveSubscriptionEntitlement(sub, env);
    expect(resolved.tier).toBe("free");
  });
});

describe("tierFromPriceId", () => {
  it("maps configured price IDs", async () => {
    const { tierFromPriceId } = await import("@/lib/stripe/config");
    expect(tierFromPriceId("price_plus", env)).toBe("plus");
    expect(tierFromPriceId("price_max", env)).toBe("max");
    expect(tierFromPriceId("price_other", env)).toBeNull();
  });
});
