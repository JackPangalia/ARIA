"use client";

/**
 * Minimal client error reporter: uncaught errors and unhandled rejections are
 * POSTed to /api/client-errors, which logs them server-side so they show up in
 * Vercel logs (searchable as "[client-error]"). Deliberately tiny — no vendor,
 * no storage; just enough to know when the app is broken for real users.
 */

const MAX_REPORTS_PER_LOAD = 5;
const MIN_GAP_MS = 10_000;
const MAX_STACK_CHARS = 4_000;

let installed = false;
let reportCount = 0;
let lastReportAt = 0;
const seen = new Set<string>();

function report(message: string, stack: string | undefined, source: string) {
  const now = Date.now();
  if (reportCount >= MAX_REPORTS_PER_LOAD) return;
  if (now - lastReportAt < MIN_GAP_MS && reportCount > 0) return;

  const fingerprint = `${message}:${source}`;
  if (seen.has(fingerprint)) return;
  seen.add(fingerprint);

  reportCount += 1;
  lastReportAt = now;

  try {
    const body = JSON.stringify({
      message: message.slice(0, 500),
      stack: stack?.slice(0, MAX_STACK_CHARS),
      source,
      url: window.location.pathname,
      userAgent: navigator.userAgent.slice(0, 300),
      anonId: window.localStorage.getItem("kivo_aid") ?? undefined,
    });
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never throw.
  }
}

export function installClientErrorReporter(): void {
  if (installed || typeof window === "undefined") return;
  if (process.env.NODE_ENV === "development") return;
  installed = true;

  window.addEventListener("error", (event) => {
    report(
      event.message || "Unknown error",
      event.error instanceof Error ? event.error.stack : undefined,
      `${event.filename ?? "?"}:${event.lineno ?? 0}`
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason ?? "Unhandled rejection");
    report(
      message,
      reason instanceof Error ? reason.stack : undefined,
      "unhandledrejection"
    );
  });
}
