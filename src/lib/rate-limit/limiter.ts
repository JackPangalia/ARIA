import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Fixed-window rate limiter backed by Firestore (serverless instances share no
 * memory, so the counter must live in a shared store). One transaction per
 * check: read the window's counter doc, deny if at the limit, else increment.
 *
 * FAIL-OPEN by design: a Firestore hiccup must never take down /api/ask — on
 * any error we log once and allow the request.
 *
 * Docs live in the top-level `ratelimits` collection, which the client can
 * never touch (firestore.rules ends in a catch-all deny). Ops: set a Firestore
 * TTL policy on `expiresAt` so stale windows self-delete.
 */

export interface RateLimitConfig {
  /** Route-class name; part of the counter doc id (e.g. "ask"). */
  name: string;
  /** Max requests per window. */
  limit: number;
  windowSeconds: number;
  /**
   * Whether an allowed request increments the window counter. Defaults to
   * true. Set false to enforce the ceiling *without* consuming budget — used
   * for speculative asks, which pre-warm the pipeline and are frequently
   * discarded; a runaway client is still bounded (the check denies once the
   * window is full) but a normal user's speculations don't burn their quota.
   */
  consume?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets (for the Retry-After header). */
  retryAfterSeconds: number;
}

let loggedFailOpen = false;

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const windowMs = config.windowSeconds * 1000;
  const nowMs = Date.now();
  const windowStart = Math.floor(nowMs / windowMs) * windowMs;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowStart + windowMs - nowMs) / 1000)
  );

  try {
    const db = getAdminDb();
    // Keys can contain user-provided anon ids; sanitize for doc-id safety.
    const safeKey = key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128);
    const ref = db
      .collection("ratelimits")
      .doc(`${safeKey}:${config.name}:${windowStart}`);

    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? Number(snap.data()?.count ?? 0) : 0;
      if (count >= config.limit) {
        return { allowed: false, retryAfterSeconds };
      }
      if (config.consume === false) {
        return { allowed: true, retryAfterSeconds };
      }
      tx.set(
        ref,
        {
          count: FieldValue.increment(1),
          expiresAt: Timestamp.fromMillis(windowStart + windowMs),
        },
        { merge: true }
      );
      return { allowed: true, retryAfterSeconds };
    });
  } catch (err) {
    if (!loggedFailOpen) {
      loggedFailOpen = true;
      console.error("[rate-limit] check failed; failing open:", err);
    }
    return { allowed: true, retryAfterSeconds };
  }
}

/** Best-effort client key for unauthenticated routes: first x-forwarded-for hop. */
export function requestIpKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip && ip.length > 0 ? `ip_${ip}` : "ip_unknown";
}
