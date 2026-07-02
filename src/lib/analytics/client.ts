"use client";

import type { EventName } from "@/lib/analytics/events";

const ANON_ID_KEY = "kivo_aid";

function anonId(): string {
  try {
    let id = window.localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

/**
 * Fire-and-forget funnel event. Must never throw or slow the caller down:
 * sendBeacon survives page unloads (checkout redirects), keepalive fetch is
 * the fallback. Failures are silently dropped — analytics never breaks the app.
 */
export function track(
  name: EventName,
  options?: { uid?: string | null; props?: Record<string, string | number> }
): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      name,
      anonId: anonId(),
      uid: options?.uid ?? undefined,
      props: options?.props,
    });
    if (navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) {
      return;
    }
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let analytics surface an error.
  }
}
