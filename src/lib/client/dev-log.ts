"use client";

type DevLogEntry = {
  type: string;
  message: string;
  data?: Record<string, unknown>;
};

/** A voice turn emits ~30 log lines in a few seconds. One request each buries
 * the dev server — every POST costs it hundreds of ms of compile/route work on
 * the same event loop that streams the LLM response, so the answer itself
 * stalls. Coalesce into one request per tick instead. */
const FLUSH_INTERVAL_MS = 150;

let queue: DevLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  flushTimer = null;
  if (queue.length === 0) return;
  const entries = queue;
  queue = [];

  void fetch("/api/dev-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
    keepalive: true,
  }).catch(() => {
    /* ignore */
  });
}

export function devLog(type: string, message: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;

  queue.push({ type, message, data });
  if (flushTimer === null) {
    flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
  }
}
