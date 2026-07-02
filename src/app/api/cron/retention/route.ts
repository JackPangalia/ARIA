import { NextRequest } from "next/server";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { jsonError, jsonOk } from "@/lib/sessions/api-response";
import { deleteSession } from "@/lib/sessions/repository";
import { DEFAULT_TIER, isTier, planLimits } from "@/lib/plan/tiers";
import {
  retentionCutoffIso,
  selectExpiredSessions,
  type RetentionCandidate,
} from "@/lib/retention/select";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Users examined per run; the cursor in cron_state/retention makes the sweep incremental. */
const USERS_PER_RUN = 50;
/** Hard cap on deletions per run so a backlog can't blow the 60s budget. */
const DELETE_BUDGET = 100;

/**
 * Nightly hard-delete of sessions past the plan's history-retention window
 * (plus grace) — the enforcement behind the "N-day session history" claim.
 * Display-side hiding happens at read time in listSessions; this purges.
 * Triggered by Vercel Cron (vercel.json), authenticated via CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return jsonError("CRON_SECRET is not configured.", 500);
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError("Unauthorized.", 401);
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const db = getAdminDb();
  const cursorRef = db.collection("cron_state").doc("retention");
  const cursor = await cursorRef.get();
  const lastUid: string | null = cursor.exists
    ? (cursor.data()?.lastUid ?? null)
    : null;

  let usersQuery = db
    .collection("users")
    .orderBy(FieldPath.documentId())
    .limit(USERS_PER_RUN);
  if (lastUid) usersQuery = usersQuery.startAfter(lastUid);

  const users = await usersQuery.get();
  const now = new Date();

  let scanned = 0;
  let deleted = 0;
  const deletedIds: string[] = [];

  for (const userDoc of users.docs) {
    if (deleted >= DELETE_BUDGET) break;
    const uid = userDoc.id;

    const planSnap = await userDoc.ref
      .collection("private")
      .doc("plan")
      .get();
    const rawTier = planSnap.exists ? planSnap.data()?.tier : null;
    const tier = isTier(rawTier) ? rawTier : DEFAULT_TIER;
    const retentionDays = planLimits(tier).historyRetentionDays;
    if (retentionDays == null) continue; // Unlimited history — nothing to purge.

    const cutoffIso = retentionCutoffIso(retentionDays, now);
    if (!cutoffIso) continue;

    const expiredSnap = await userDoc.ref
      .collection("sessions")
      .where("updatedAt", "<", Timestamp.fromDate(new Date(cutoffIso)))
      .limit(DELETE_BUDGET - deleted)
      .get();

    const candidates: RetentionCandidate[] = expiredSnap.docs.map((doc) => {
      const data = doc.data();
      const updatedAt = data.updatedAt;
      return {
        id: doc.id,
        status: data.status ?? "ended",
        pinned: Boolean(data.pinned),
        updatedAt:
          updatedAt instanceof Timestamp
            ? updatedAt.toDate().toISOString()
            : String(updatedAt ?? new Date(0).toISOString()),
      };
    });
    scanned += candidates.length;

    // The query already applied the age cutoff; the pure selector re-applies it
    // plus the pinned/active exclusions that hold the tested invariants.
    const expiredIds = selectExpiredSessions({
      sessions: candidates,
      retentionDays,
      now,
    });

    for (const sessionId of expiredIds) {
      if (deleted >= DELETE_BUDGET) break;
      if (!dryRun) {
        await deleteSession(uid, sessionId).catch((err) =>
          console.error(`[retention] delete failed ${uid}/${sessionId}:`, err)
        );
      }
      deleted += 1;
      deletedIds.push(`${uid}/${sessionId}`);
    }
  }

  // Advance the cursor; when the page came up short the sweep is complete and
  // the next run starts over from the top.
  const nextCursor =
    users.docs.length < USERS_PER_RUN
      ? null
      : users.docs[users.docs.length - 1].id;
  if (!dryRun) {
    await cursorRef.set({
      lastUid: nextCursor,
      lastRunAt: new Date().toISOString(),
    });
  }

  const summary = {
    users: users.docs.length,
    scanned,
    deleted,
    dryRun,
    cursorReset: nextCursor === null,
    ...(dryRun ? { wouldDelete: deletedIds } : {}),
  };
  console.log("[retention]", JSON.stringify(summary));
  return jsonOk(summary);
}
