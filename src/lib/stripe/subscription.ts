import type Stripe from "stripe";
import { DEFAULT_TIER, type Tier } from "@/lib/plan/tiers";
import { anchorDayFromDate } from "@/lib/plan/period";
import { getBillingEnv, tierFromPriceId, type BillingEnv } from "@/lib/stripe/config";

const PAID_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
]);

function primaryPriceId(subscription: Stripe.Subscription): string | null {
  const item = subscription.items.data[0];
  return item?.price?.id ?? null;
}

export interface ResolvedSubscription {
  tier: Tier;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  stripeStatus: Stripe.Subscription.Status;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  billingAnchorDay: number;
}

type SubscriptionPeriodFields = Stripe.Subscription & {
  current_period_start?: number;
  current_period_end?: number;
};

function periodStartSeconds(subscription: Stripe.Subscription): number {
  const sub = subscription as SubscriptionPeriodFields;
  return (
    sub.current_period_start ??
    subscription.billing_cycle_anchor ??
    subscription.start_date ??
    Math.floor(Date.now() / 1000)
  );
}

function periodEndSeconds(subscription: Stripe.Subscription): number | null {
  const sub = subscription as SubscriptionPeriodFields;
  return sub.current_period_end ?? null;
}

export function resolveSubscriptionEntitlement(
  subscription: Stripe.Subscription,
  env: BillingEnv = getBillingEnv()
): ResolvedSubscription {
  const priceId = primaryPriceId(subscription);
  const status = subscription.status;
  const paid =
    PAID_STATUSES.has(status) && priceId
      ? tierFromPriceId(priceId, env)
      : null;

  const periodStart = new Date(periodStartSeconds(subscription) * 1000);
  const periodEndSec = periodEndSeconds(subscription);

  return {
    tier: paid ?? DEFAULT_TIER,
    stripeCustomerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    stripeStatus: status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd: periodEndSec
      ? new Date(periodEndSec * 1000).toISOString()
      : null,
    billingAnchorDay: anchorDayFromDate(periodStart),
  };
}
