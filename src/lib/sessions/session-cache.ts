import type { SessionDoc } from "@/lib/sessions/types";

/**
 * Short-lived session-doc cache for the ask path.
 *
 * `/api/ask` reads the session twice over on every turn: once to prove
 * ownership, then again (transitively) because `buildContextBundle` cannot
 * start until the doc resolves. That makes `verifyIdToken → getSession →
 * buildContextBundle` a serial chain of Firestore round trips in front of the
 * LLM call — measured at 215ms setup + 156ms context before a single token is
 * requested. Holding the doc for a few seconds collapses the middle hop for
 * every turn after the first in a session.
 *
 * Deliberately *not* wired into `getSession` itself: other routes read sessions
 * for lists and detail views where freshness matters more than a Firestore
 * round trip. Only the latency-critical reader opts in.
 *
 * Per-instance by design (like `context-prefetch-cache`). On serverless a cold
 * instance simply misses and does the read; nothing about correctness depends
 * on a hit.
 *
 * ## Staleness invariant
 *
 * Safe only because the ask path reads a narrow, slow-moving slice of the doc —
 * `status`, `transcriptionMode`, `projectId`, `title`, `speakerCount` — and the
 * per-turn writes in `repository.ts` (`appendTurn`, `markTurnsSummarized`,
 * `upsertSummary`) touch none of them; they move `updatedAt`, `turnCount`,
 * `tokenEstimate`, `searchableTextPreview`, `lastSummaryAt` only. Everything
 * that *can* change the read slice is an explicit user action routed through
 * `patchSession` / `setSessionBotState` / `deleteSession`, each of which
 * invalidates here.
 *
 * If you add a session-doc field to the ask path, confirm no per-turn write
 * mutates it — or invalidate from that write too. Getting this wrong shows up
 * as an archived session still answering, or a renamed one answering under its
 * old title, for up to {@link SESSION_CACHE_TTL_MS}.
 */
export const SESSION_CACHE_TTL_MS = 30_000;

/** Bounds per-instance memory; a busy instance serves few concurrent sessions. */
const MAX_ENTRIES = 500;

type Entry = { session: SessionDoc; expiresAt: number };

const cache = new Map<string, Entry>();

function keyFor(uid: string, sessionId: string): string {
  return `${uid}:${sessionId}`;
}

export function readCachedSession(
  uid: string,
  sessionId: string
): SessionDoc | null {
  const entry = cache.get(keyFor(uid, sessionId));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(keyFor(uid, sessionId));
    return null;
  }
  return entry.session;
}

export function storeCachedSession(uid: string, session: SessionDoc): void {
  // Cheapest possible bound: drop the oldest insertion once over the cap.
  // Map preserves insertion order, so the first key is the least recently set.
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(keyFor(uid, session.id), {
    session,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });
}

/** Called from every write that can change a field the ask path reads. */
export function invalidateCachedSession(uid: string, sessionId: string): void {
  cache.delete(keyFor(uid, sessionId));
}

/** For tests only. */
export function resetSessionCacheForTests(): void {
  cache.clear();
}
