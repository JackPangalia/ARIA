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
  periodKeyForTier,
} from "@/lib/plan/period";
import { emptyUsage, type UsageDoc, type UserPlanDoc } from "@/lib/plan/types";
import type { TranscriptionMode } from "@/lib/sessions/types";
import { isAskModelId, type AskModelId } from "@/lib/aria/models";
import { isKivoVoiceId } from "@/lib/audio/voices";

// Plan + usage live under server-write-only paths (see firestore.rules).
function planRef(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("private").doc("plan");
}

/**
 * Short-lived entitlement cache for the ask path.
 *
 * `loadEntitlements` is two *serial* Firestore reads — `getOrCreatePlan`, then
 * `readUsage` against a period key derived from the plan's tier and billing
 * anchor. In `/api/ask` it runs alongside the rate-limit and session reads, so
 * once those are fast it becomes the slowest leg of the pre-LLM fan-out and
 * sets the floor on time-to-first-token.
 *
 * What goes stale, and why it is acceptable:
 * - **Usage counters** drift for up to the TTL, so a user at their ceiling may
 *   get a few extra asks. The route already treats this as "a soft backstop:
 *   only blocked once fully over the generous budget" and fails open on a read
 *   error; the hard 20/min rate limit is what actually bounds a runaway client.
 * - **Preferences** (answer model, voice) would otherwise take up to the TTL to
 *   apply, which *is* user-visible — so every plan-doc write goes through
 *   {@link writePlanDoc}, which invalidates.
 */
const ENTITLEMENTS_TTL_MS = 30_000;

const entitlementsCache = new Map<
  string,
  { value: Entitlements; expiresAt: number }
>();

/**
 * Every plan-doc write in this file funnels through here so cache invalidation
 * cannot be forgotten when a new setter is added. Writing to `planRef` directly
 * would leave a stale preference served to the ask path.
 */
async function writePlanDoc(
  db: Firestore,
  uid: string,
  data: Record<string, unknown>
): Promise<void> {
  await planRef(db, uid).set(data, { merge: true });
  entitlementsCache.delete(uid);
}

/** For tests only. */
export function resetEntitlementsCacheForTests(): void {
  entitlementsCache.clear();
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
    topUpListeningSeconds: Number(data.topUpListeningSeconds ?? 0),
    defaultTranscriptionMode,
    answerModel: isAskModelId(data.answerModel) ? data.answerModel : null,
    voiceId: isKivoVoiceId(data.voiceId) ? data.voiceId : null,
    onboardingCompletedAt: data.onboardingCompletedAt
      ? toIso(data.onboardingCompletedAt)
      : null,
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
 * Standard transcription mode across all tiers is speaker diarization.
 */
export function effectiveDefaultTranscriptionMode(
  tier: Tier,
  preferred: TranscriptionMode | null | undefined,
  _limits?: PlanLimits,
  _usage?: UsageDoc
): TranscriptionMode {
  return preferred ?? "speaker";
}

export async function setDefaultTranscriptionMode(
  uid: string,
  mode: TranscriptionMode
): Promise<UserPlanDoc> {
  const db = getAdminDb();
  await writePlanDoc(db, uid, {
    defaultTranscriptionMode: mode,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return getOrCreatePlan(uid);
}

/** Open to every tier — no entitlement check, unlike transcription mode. */
export async function setAnswerModel(
  uid: string,
  model: AskModelId
): Promise<UserPlanDoc> {
  const db = getAdminDb();
  await writePlanDoc(db, uid, {
    answerModel: model,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return getOrCreatePlan(uid);
}

/** Voice preference — open to every tier, like the answer model. */
export async function setVoiceSettings(
  uid: string,
  settings: { voiceId?: string | null }
): Promise<UserPlanDoc> {
  const db = getAdminDb();
  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (settings.voiceId !== undefined) update.voiceId = settings.voiceId;
  await writePlanDoc(db, uid, update);
  return getOrCreatePlan(uid);
}

/** Admin/dev only (set-tier script). Never called from client routes. */
export async function setUserTier(uid: string, tier: Tier): Promise<void> {
  const db = getAdminDb();
  await writePlanDoc(db, uid, { tier, updatedAt: FieldValue.serverTimestamp() });
  // Ensure a plan doc with an anchor exists even if set before first login.
  await getOrCreatePlan(uid);
}

/** Adds pre-paid top-up listening seconds to the user's plan. */
export async function addTopUpSeconds(uid: string, seconds: number): Promise<UserPlanDoc> {
  if (!Number.isFinite(seconds) || seconds <= 0) return getOrCreatePlan(uid);
  const db = getAdminDb();
  await writePlanDoc(db, uid, {
    topUpListeningSeconds: FieldValue.increment(Math.round(seconds)),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return getOrCreatePlan(uid);
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
  await writePlanDoc(db, uid, { ...patch, updatedAt: FieldValue.serverTimestamp() });
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
  // Writes the plan doc directly (transaction + stale-event guard), so it can't
  // route through writePlanDoc — invalidate here or a tier change waits out the
  // entitlement TTL before the new limits apply.
  entitlementsCache.delete(uid);
  await getOrCreatePlan(uid);
}

/** Dunning flag: set when Stripe reports a failed payment; cleared on recovery. */
export async function markPaymentFailed(uid: string): Promise<void> {
  const db = getAdminDb();
  await writePlanDoc(db, uid, {
    paymentFailedAt: new Date().toISOString(),
    updatedAt: FieldValue.serverTimestamp(),
  });
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
  const periodKey = periodKeyForTier(plan.tier, plan.billingAnchorDay, new Date());
  const usage = await readUsage(db, uid, periodKey);
  return { plan, tier: plan.tier, limits: planLimits(plan.tier), usage, periodKey };
}

/**
 * Entitlements for the ask path, served from a short-lived cache — see the
 * note on {@link ENTITLEMENTS_TTL_MS} for what may go stale and why that is
 * acceptable *here specifically*.
 *
 * Deliberately not the default: the billing panel and usage meter exist to show
 * the user their current numbers, and must keep reading through.
 */
export async function loadEntitlementsCached(uid: string): Promise<Entitlements> {
  const cached = entitlementsCache.get(uid);
  if (cached && cached.expiresAt >= Date.now()) return cached.value;
  const value = await loadEntitlements(uid);
  entitlementsCache.set(uid, {
    value,
    expiresAt: Date.now() + ENTITLEMENTS_TTL_MS,
  });
  return value;
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
  const pRef = planRef(db, uid);
  const now = new Date();

  return db.runTransaction(async (tx) => {
    const planSnap = await tx.get(pRef);
    const plan = planSnap.exists ? mapPlan(planSnap.data() ?? {}) : await getOrCreatePlan(uid);
    const limits = planLimits(plan.tier);
    const periodKey = periodKeyForTier(plan.tier, plan.billingAnchorDay, now);
    const ref = usageRef(db, uid, periodKey);

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

    const baseCap = limits.listeningMinutesPerMonth * 60;
    let topUpDeduction = 0;
    const nextSeconds = current.listeningSeconds + deltaSeconds;

    if (nextSeconds > baseCap && (plan.topUpListeningSeconds ?? 0) > 0 && deltaSeconds > 0) {
      const previousExcess = Math.max(0, current.listeningSeconds - baseCap);
      const newExcess = nextSeconds - baseCap;
      const incrementalExcess = newExcess - previousExcess;
      topUpDeduction = Math.min(plan.topUpListeningSeconds ?? 0, incrementalExcess);
      if (topUpDeduction > 0) {
        tx.set(
          pRef,
          {
            topUpListeningSeconds: FieldValue.increment(-topUpDeduction),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

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

    const remainingBase = Math.max(0, baseCap - nextSeconds);
    const remainingTopUp = Math.max(0, (plan.topUpListeningSeconds ?? 0) - topUpDeduction);
    const remaining = remainingBase + remainingTopUp;
    return { remainingSeconds: remaining, stop: remaining <= 0 };
  });
}

/** Records ask usage after an answer completes. Atomic increment; soft cap. */
export async function recordAsk(uid: string, tokens: number): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  const db = getAdminDb();
  const plan = await getOrCreatePlan(uid);
  const periodKey = periodKeyForTier(plan.tier, plan.billingAnchorDay, new Date());
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

/** Marks first-run onboarding complete. Idempotent if already set. */
export async function completeOnboarding(uid: string): Promise<UserPlanDoc> {
  const db = getAdminDb();
  const ref = planRef(db, uid);
  const snap = await ref.get();
  if (snap.exists && snap.data()?.onboardingCompletedAt) {
    return mapPlan(snap.data() ?? {});
  }
  const now = new Date().toISOString();
  await ref.set(
    {
      onboardingCompletedAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return getOrCreatePlan(uid);
}

/** Re-export for callers that want the remaining-seconds calc without a full load. */
export { remainingListeningSeconds };
