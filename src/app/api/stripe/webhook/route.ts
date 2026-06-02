import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { jsonError, jsonOk } from "@/lib/sessions/api-response";
import { getBillingEnv, isStripeConfigured } from "@/lib/stripe/config";
import { getStripe } from "@/lib/stripe/client";
import {
  firebaseUidFromMetadata,
  syncPlanFromSubscription,
} from "@/lib/stripe/sync";
import { updatePlanFromStripe } from "@/lib/plan/repository";
import { DEFAULT_TIER } from "@/lib/plan/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveUidFromCustomer(
  stripe: Stripe,
  customerId: string
): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  return firebaseUidFromMetadata(customer.metadata);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const uid =
    firebaseUidFromMetadata(session.metadata) ??
    (typeof session.client_reference_id === "string"
      ? session.client_reference_id
      : null);

  if (!uid) {
    console.warn("[stripe-webhook] checkout.session.completed missing uid");
    return;
  }

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;
  if (!subscriptionId) return;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncPlanFromSubscription(uid, subscription);
}

async function customerFirebaseUid(
  stripe: Stripe,
  customer: string | Stripe.Customer | Stripe.DeletedCustomer
): Promise<string | null> {
  if (typeof customer === "string") {
    return resolveUidFromCustomer(stripe, customer);
  }
  if (customer.deleted) return null;
  return firebaseUidFromMetadata(customer.metadata);
}

async function handleSubscriptionEvent(subscription: Stripe.Subscription) {
  const stripe = getStripe();
  const uid =
    firebaseUidFromMetadata(subscription.metadata) ??
    (await customerFirebaseUid(stripe, subscription.customer));

  if (!uid) {
    console.warn("[stripe-webhook] subscription event missing uid", subscription.id);
    return;
  }

  await syncPlanFromSubscription(uid, subscription);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const stripe = getStripe();
  const uid =
    firebaseUidFromMetadata(subscription.metadata) ??
    (await customerFirebaseUid(stripe, subscription.customer));

  if (!uid) return;

  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.deleted
        ? null
        : subscription.customer.id;

  await updatePlanFromStripe(uid, {
    tier: DEFAULT_TIER,
    billingAnchorDay: new Date().getUTCDate(),
    stripeCustomerId,
    stripeSubscriptionId: null,
    stripePriceId: null,
    stripeStatus: "canceled",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  });
}

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return jsonError("Billing is not configured.", 503);
  }

  const env = getBillingEnv();
  const stripe = getStripe();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return jsonError("Missing Stripe signature.", 400);
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature.";
    console.error("[stripe-webhook] signature verification failed:", msg);
    return jsonError("Invalid webhook signature.", 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionEvent(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err);
    return jsonError("Webhook handler failed.", 500);
  }

  return jsonOk({ received: true });
}
