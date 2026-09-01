import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { jsonError, jsonOk } from "@/lib/sessions/api-response";
import { getAdminDb } from "@/lib/firebase/admin";
import { getBillingEnv, isStripeConfigured } from "@/lib/stripe/config";
import { getStripe } from "@/lib/stripe/client";
import {
  firebaseUidFromMetadata,
  syncPlanFromSubscription,
} from "@/lib/stripe/sync";
import {
  addTopUpSeconds,
  markPaymentFailed,
  updatePlanFromStripe,
} from "@/lib/plan/repository";
import { DEFAULT_TIER } from "@/lib/plan/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only these event types do work; everything else is acked without a dedupe doc. */
const HANDLED_EVENTS = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

async function resolveUidFromCustomer(
  stripe: Stripe,
  customerId: string
): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  return firebaseUidFromMetadata(customer.metadata);
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventCreated: number
) {
  const uid =
    firebaseUidFromMetadata(session.metadata) ??
    (typeof session.client_reference_id === "string"
      ? session.client_reference_id
      : null);

  if (!uid) {
    console.warn("[stripe-webhook] checkout.session.completed missing uid");
    return;
  }

  // Check if this checkout session is a one-time top-up purchase
  if (session.mode === "payment" && session.metadata?.type === "topup") {
    const secondsAdded = Number(session.metadata?.secondsAdded ?? 0);
    if (secondsAdded > 0) {
      await addTopUpSeconds(uid, secondsAdded);
      await getAdminDb()
        .collection("events")
        .add({
          name: "topup_purchased",
          anonId: "server",
          uid,
          props: {
            packId: session.metadata?.packId,
            secondsAdded,
          },
          ts: FieldValue.serverTimestamp(),
        })
        .catch((err: unknown) =>
          console.error("[stripe-webhook] topup_purchased event write failed:", err)
        );
    }
    return;
  }

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;
  if (!subscriptionId) return;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncPlanFromSubscription(uid, subscription, eventCreated);

  // Funnel event written server-side — the webhook is the only reliable
  // observer of a completed purchase (the client may never return from Stripe).
  await getAdminDb()
    .collection("events")
    .add({
      name: "plan_activated",
      anonId: "server",
      uid,
      props: {},
      ts: FieldValue.serverTimestamp(),
    })
    .catch((err: unknown) =>
      console.error("[stripe-webhook] plan_activated event write failed:", err)
    );
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

async function handleSubscriptionEvent(
  subscription: Stripe.Subscription,
  eventCreated: number
) {
  const stripe = getStripe();
  const uid =
    firebaseUidFromMetadata(subscription.metadata) ??
    (await customerFirebaseUid(stripe, subscription.customer));

  if (!uid) {
    console.warn("[stripe-webhook] subscription event missing uid", subscription.id);
    return;
  }

  await syncPlanFromSubscription(uid, subscription, eventCreated);
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  eventCreated: number
) {
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

  await updatePlanFromStripe(
    uid,
    {
      tier: DEFAULT_TIER,
      billingAnchorDay: new Date().getUTCDate(),
      stripeCustomerId,
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeStatus: "canceled",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    },
    { eventCreated }
  );
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const stripe = getStripe();
  const uid =
    typeof invoice.customer === "string"
      ? await resolveUidFromCustomer(stripe, invoice.customer)
      : null;

  if (!uid) {
    console.warn("[stripe-webhook] invoice.payment_failed missing uid", invoice.id);
    return;
  }

  // past_due keeps the paid tier as a grace period; Stripe's dunning emails are
  // the user-facing surface. We flag the plan and log so it shows in ops logs.
  console.error("[stripe-webhook] payment failed for uid", uid);
  await markPaymentFailed(uid);
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

  if (!HANDLED_EVENTS.has(event.type)) {
    return jsonOk({ received: true });
  }

  // Stripe delivers at-least-once; create() is atomic, so a concurrent or
  // retried delivery of the same event id is acked without re-running handlers.
  // (Ops: set a Firestore TTL policy on stripe_events.receivedAt.)
  const eventRef = getAdminDb().collection("stripe_events").doc(event.id);
  try {
    await eventRef.create({
      type: event.type,
      created: event.created,
      receivedAt: FieldValue.serverTimestamp(),
    });
  } catch {
    return jsonOk({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          event.created
        );
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionEvent(
          event.data.object as Stripe.Subscription,
          event.created
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
          event.created
        );
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err);
    // Un-mark the event so Stripe's retry actually reprocesses it instead of
    // hitting the dedupe guard and becoming a permanent no-op.
    await eventRef.delete().catch(() => {});
    return jsonError("Webhook handler failed.", 500);
  }

  return jsonOk({ received: true });
}
