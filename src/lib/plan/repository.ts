import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  DEFAULT_TIER,
  HEARTBEAT_MAX_DELTA_SECONDS,
  isTier,
  planLimits,
  type PlanLimits,
  type Tier,
} from "@/lib/plan/tiers";
import {
  remainingListeningSeconds,
  speakerModeExhausted,
} from "@/lib/plan/entitlements";
import {
  anchorDayFromDate,
  clampAnchorDay,
  currentPeriodKey,
} from "@/lib/plan/period";
import { emptyUsage, type UsageDoc, type UserPlanDoc } from "@/lib/plan/types";
import type { TranscriptionMode } from "@/lib/sessions/types";
import { isAskModelId, type AskModelId } from "@/lib/aria/models";

// Plan + usage live under server-write-only paths (see firestore.rules).
function planRef(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("private").doc("plan");
}
function usageCol(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("usage");
}
function usageRef(db: Firestore, uid: string, periodKey: string) {
  return usageCol(db, uid).doc(periodKey);
}

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function mapPlan(data: DocumentData): UserPlanDoc {
  const defaultTranscriptionMode =
    data.defaultTranscriptionMode === "basic" ||
    data.defaultTranscriptionMode === "speaker"
      ? data.defaultTranscriptionMode
      : null;
  return {
    tier: isTier(data.tier) ? data.tier : DEFAULT_TIER,
    billingAnchorDay: clampAnchorDay(Number(data.billingAnchorDay ?? 1)),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    stripeCustomerId: data.stripeCustomerId ? String(data.stripeCustomerId) : null,
    stripeSubscriptionId: data.stripeSubscriptionId
      ? String(data.stripeSubscriptionId)
      : null,
    stripePriceId: data.stripePriceId ? String(data.stripePriceId) : null,
    stripeStatus: data.stripeStatus ? String(data.stripeStatus) : null,
    cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
    currentPeriodEnd: data.currentPeriodEnd ? toIso(data.currentPeriodEnd) : null,
    defaultTranscriptionMode,
    answerModel: isAskModelId(data.answerModel) ? data.answerModel : null,
  };
}

function mapUsage(periodKey: string, data: DocumentData): UsageDoc {
  return {
    periodKey,
    listeningSeconds: Number(data.listeningSeconds ?? 0),
    speakerSeconds: Number(data.speakerSeconds ?? 0),
    askTokens: Number(data.askTokens ?? 0),
    askCount: Number(data.askCount ?? 0),
    lastHeartbeatAt: data.lastHeartbeatAt ? toIso(data.lastHeartbeatAt) : null,
    activeSessionId: data.activeSessionId ? String(data.activeSessionId) : null,
    updatedAt: toIso(data.updatedAt),
  };
}

/** Reads the user's plan, lazily creating a default Free plan on first access. */
export async function getOrCreatePlan(uid: string): Promise<UserPlanDoc> {
  const db = getAdminDb();
  const ref = planRef(db, uid);
  const snap = await ref.get();
  if (snap.exists) return mapPlan(snap.data() ?? {});

  const now = new Date();
  const created = {
    tier: DEFAULT_TIER,
    billingAnchorDay: anchorDayFromDate(now),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  // create() avoids clobbering a plan written by a concurrent request.
  try {
    await ref.create(created);
  } catch {
    const existing = await ref.get();
    if (existing.exists) return mapPlan(existing.data() ?? {});
  }
  const next = await ref.get();
  return mapPlan(next.data() ?? {});
}

export async function getUserTier(uid: string): Promise<Tier> {
  return (await getOrCreatePlan(uid)).tier;
}

/**
 * Free tier gets a limited monthly allotment of Speaker recognition minutes
 * (see `PlanLimits.speakerMinutesPerMonth`); once exhausted, new sessions fall
 * back to Basic until the allotment resets next period. Active sessions keep
 * the mode they started with — diarization can't change mid-connection.
 */
export function effectiveDefaultTranscriptionMode(
  tier: Tier,
  preferred: TranscriptionMode | null | undefined,
  limits?: PlanLimits,
  usage?: UsageDoc
): TranscriptionMode {
  if (tier === "free") {
    if (preferred !== "speaker") return "basic";
    if (limits && usage && speakerModeExhausted(limits, usage)) return "basic";
    return "speaker";
  }
  return preferred ?? "speaker";
}

export async function setDefaultTranscriptionMode(
  uid: string,
  mode: TranscriptionMode
): Promise<UserPlanDoc> {
  const entitlements = await loadEntitlements(uid);
  const { plan } = entitlements;
  if (
    plan.tier === "free" &&
    mode === "speaker" &&
    speakerModeExhausted(entitlements.limits, entitlements.usage)
  ) {
    throw new Error(
      "You've used your 2 hours of Speaker recognition for this month. Upgrade for unlimited access."
    );
  }

  const db = getAdminDb();
  await planRef(db, uid).set(
    {
      defaultTranscriptionMode: mode,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return getOrCreatePlan(uid);
}

/** Open to every tier — no entitlement check, unlike transcription mode. */
export async function setAnswerModel(
  uid: string,
  model: AskModelId
): Promise<UserPlanDoc> {
  const db = getAdminDb();
  await planRef(db, uid).set(
    {
      answerModel: model,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return getOrCreatePlan(uid);
}

/** Admin/dev only (set-tier script). Never called from client routes. */
export async function setUserTier(uid: string, tier: Tier): Promise<void> {
  const db = getAdminDb();
  await planRef(db, uid).set(
    { tier, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  // Ensure a plan doc with an anchor exists even if set before first login.
  await getOrCreatePlan(uid);
}

export interface StripePlanPatch {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  stripeStatus?: string | null;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;
}

/** Partial Stripe field update — used when creating a customer before checkout. */
export async function updatePlanStripeFields(
  uid: string,
  patch: StripePlanPatch
): Promise<void> {
  const db = getAdminDb();
  await planRef(db, uid).set(
    { ...patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

export interface StripePlanSync extends StripePlanPatch {
  tier: Tier;
  billingAnchorDay: number;
}

/**
 * Ordering guard for Stripe webhook writes. Stripe delivers events at-least-once
 * and out of order; an older subscription.updated arriving after a newer one must
 * not regress the plan. Returns true when the incoming event is newer than the
 * last one applied (or when either side has no ordering information).
 */
export function shouldApplyStripeEvent(
  lastEventCreated: number | null | undefined,
  eventCreated: number | null | undefined
): boolean {
  if (typeof eventCreated !== "number") return true;
  if (typeof lastEventCreated !== "number") return true;
  return eventCreated >= lastEventCreated;
}

/** Authoritative entitlement write from Stripe webhooks / checkout completion. */
export async function updatePlanFromStripe(
  uid: string,
  sync: StripePlanSync,
  options?: { eventCreated?: number }
): Promise<void> {
  const db = getAdminDb();
  const ref = planRef(db, uid);
  const eventCreated = options?.eventCreated;
  const fields = {
    tier: sync.tier,
    billingAnchorDay: sync.billingAnchorDay,
    stripeCustomerId: sync.stripeCustomerId ?? null,
    stripeSubscriptionId: sync.stripeSubscriptionId ?? null,
    stripePriceId: sync.stripePriceId ?? null,
    stripeStatus: sync.stripeStatus ?? null,
    cancelAtPeriodEnd: sync.cancelAtPeriodEnd ?? false,
    currentPeriodEnd: sync.currentPeriodEnd ?? null,
    // A subscription back in good standing clears any dunning flag.
    ...(sync.stripeStatus === "active" || sync.stripeStatus === "trialing"
      ? { paymentFailedAt: null }
      : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (typeof eventCreated === "number") {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const last = snap.exists ? snap.data()?.lastStripeEventCreated : null;
      if (!shouldApplyStripeEvent(typeof last === "number" ? last : null, eventCreated)) {
        return; // Stale event — a newer one already wrote the plan.
      }
      tx.set(ref, { ...fields, lastStripeEventCreated: eventCreated }, { merge: true });
    });
  } else {
    await ref.set(fields, { merge: true });
  }
  await getOrCreatePlan(uid);
}

/** Dunning flag: set when Stripe reports a failed payment; cleared on recovery. */
export async function markPaymentFailed(uid: string): Promise<void> {
  const db = getAdminDb();
  await planRef(db, uid).set(
    { paymentFailedAt: new Date().toISOString(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/**
 * Stripe ids for account deletion. Reads without creating — a missing plan doc
 * means there is nothing to tear down in Stripe.
 */
export async function getPlanStripeIds(uid: string): Promise<{
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}> {
  const db = getAdminDb();
  const snap = await planRef(db, uid).get();
  if (!snap.exists) return { stripeCustomerId: null, stripeSubscriptionId: null };
  const data = snap.data() ?? {};
  return {
    stripeCustomerId: data.stripeCustomerId ? String(data.stripeCustomerId) : null,
    stripeSubscriptionId: data.stripeSubscriptionId
      ? String(data.stripeSubscriptionId)
      : null,
  };
}

async function readUsage(
  db: Firestore,
  uid: string,
  periodKey: string
): Promise<UsageDoc> {
  const snap = await usageRef(db, uid, periodKey).get();
  return snap.exists ? mapUsage(periodKey, snap.data() ?? {}) : emptyUsage(periodKey);
}

export interface Entitlements {
  plan: UserPlanDoc;
  tier: Tier;
  limits: PlanLimits;
  usage: UsageDoc;
  periodKey: string;
}

/** One-shot load of everything a route needs to make an entitlement decision. */
export async function loadEntitlements(uid: string): Promise<Entitlements> {
  const db = getAdminDb();
  const plan = await getOrCreatePlan(uid);
  const periodKey = currentPeriodKey(plan.billingAnchorDay, new Date());
  const usage = await readUsage(db, uid, periodKey);
  return { plan, tier: plan.tier, limits: planLimits(plan.tier), usage, periodKey };
}

export interface HeartbeatResult {
  remainingSeconds: number;
  stop: boolean;
}

/**
 * Accrues listening time from a timed heartbeat. Server-authoritative: the billed
 * delta is the wall-clock time since this session's last heartbeat, CAPPED at
 * HEARTBEAT_MAX_DELTA_SECONDS so gaps/replays can't inflate usage. Atomic via a
 * transaction so concurrent heartbeats can't race the counter.
 */
export async function accrueListeningHeartbeat(
  uid: string,
  sessionId: string,
  transcriptionMode?: TranscriptionMode
): Promise<HeartbeatResult> {
  const db = getAdminDb();
  const plan = await getOrCreatePlan(uid);
  const limits = planLimits(plan.tier);
  const periodKey = currentPeriodKey(plan.billingAnchorDay, new Date());
  const ref = usageRef(db, uid, periodKey);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists
      ? mapUsage(periodKey, snap.data() ?? {})
      : emptyUsage(periodKey);

    const nowMs = Date.now();
    let deltaSeconds = 0;
    if (current.activeSessionId === sessionId && current.lastHeartbeatAt) {
      const elapsed = (nowMs - new Date(current.lastHeartbeatAt).getTime()) / 1000;
      deltaSeconds = Math.min(
        HEARTBEAT_MAX_DELTA_SECONDS,
        Math.max(0, Math.round(elapsed))
      );
    }
    // First heartbeat of a (re)started session establishes the baseline only.

    const nextSeconds = current.listeningSeconds + deltaSeconds;
    tx.set(
      ref,
      {
        periodKey,
        listeningSeconds: FieldValue.increment(deltaSeconds),
        ...(transcriptionMode === "speaker" && deltaSeconds > 0
          ? { speakerSeconds: FieldValue.increment(deltaSeconds) }
          : {}),
        lastHeartbeatAt: new Date(nowMs).toISOString(),
        activeSessionId: sessionId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const remaining = Math.max(0, limits.listeningMinutesPerMonth * 60 - nextSeconds);
    return { remainingSeconds: remaining, stop: remaining <= 0 };
  });
}

/** Records ask usage after an answer completes. Atomic increment; soft cap. */
export async function recordAsk(uid: string, tokens: number): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  const db = getAdminDb();
  const plan = await getOrCreatePlan(uid);
  const periodKey = currentPeriodKey(plan.billingAnchorDay, new Date());
  await usageRef(db, uid, periodKey).set(
    {
      periodKey,
      askTokens: FieldValue.increment(Math.round(tokens)),
      askCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** Re-export for callers that want the remaining-seconds calc without a full load. */
export { remainingListeningSeconds };
