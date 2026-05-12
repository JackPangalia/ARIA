"use client";

export function devLog(type: string, message: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;

  void fetch("/api/dev-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, message, data }),
  }).catch(() => {
    /* ignore */
  });
}
