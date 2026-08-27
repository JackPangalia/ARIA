"use client";

import { getSessionDetail } from "@/lib/sessions/client";
import type { SessionDetailResponse } from "@/lib/sessions/types";

/**
 * A short-lived cache of `/api/sessions/:id` responses, so opening a
 * conversation is usually a render rather than a round-trip.
 *
 * Lists warm this on hover and focus: by the time a click lands, the detail is
 * normally already here and the session can be shown synchronously. The cache
 * is deliberately tiny and short — it exists to cover the gap between pointing
 * at a row and clicking it, not to be a source of truth. Anything that mutates
 * a session drops its entry.
 */

const FRESH_MS = 20_000;
const MAX_ENTRIES = 12;

interface Entry {
  fetchedAt: number;
  value?: SessionDetailResponse;
  inFlight?: Promise<SessionDetailResponse>;
}

const cache = new Map<string, Entry>();

function trim() {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) return;
    cache.delete(oldest.value);
  }
}

/** The cached detail if it is fresh enough to show without a spinner. */
export function getCachedSessionDetail(
  sessionId: string,
): SessionDetailResponse | null {
  const entry = cache.get(sessionId);
  if (!entry?.value) return null;
  if (Date.now() - entry.fetchedAt > FRESH_MS) return null;
  return entry.value;
}

/**
 * Fetch a session's detail, sharing an in-flight request when one exists.
 * `force` skips the freshness check but still de-dupes concurrent callers.
 */
export function loadSessionDetail(
  sessionId: string,
  options: { force?: boolean } = {},
): Promise<SessionDetailResponse> {
  const entry = cache.get(sessionId);

  if (entry?.inFlight) return entry.inFlight;
  if (!options.force) {
    const fresh = getCachedSessionDetail(sessionId);
    if (fresh) return Promise.resolve(fresh);
  }

  const inFlight = getSessionDetail(sessionId)
    .then((value) => {
      cache.set(sessionId, { fetchedAt: Date.now(), value });
      trim();
      return value;
    })
    .catch((err) => {
      cache.delete(sessionId);
      throw err;
    });

  cache.set(sessionId, { ...entry, fetchedAt: entry?.fetchedAt ?? 0, inFlight });
  return inFlight;
}

/** Warm the cache from a hover or focus. Failures are silent by design. */
export function prefetchSessionDetail(sessionId: string) {
  if (!sessionId) return;
  if (getCachedSessionDetail(sessionId)) return;
  void loadSessionDetail(sessionId).catch(() => undefined);
}

/** Handlers to spread onto a row that opens a session. */
export function sessionPrefetchProps(sessionId: string) {
  const warm = () => prefetchSessionDetail(sessionId);
  return { onPointerEnter: warm, onFocus: warm };
}

export function invalidateSessionDetail(sessionId?: string) {
  if (sessionId) cache.delete(sessionId);
  else cache.clear();
}

/** Seed the cache with a detail we already fetched by other means. */
export function primeSessionDetail(detail: SessionDetailResponse) {
  cache.set(detail.session.id, { fetchedAt: Date.now(), value: detail });
  trim();
}
