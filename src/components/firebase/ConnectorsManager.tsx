"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listConnections,
  removeConnection,
  startConnection,
  type ConnectionSummary,
} from "@/lib/composio/client-api";

const SUPPORTED_APPS: { slug: string; label: string; blurb: string }[] = [
  {
    slug: "notion",
    label: "Notion",
    blurb:
      "Read pages and create new ones in your workspace when you ask ARIA to.",
  },
  {
    slug: "gmail",
    label: "Gmail",
    blurb: "Read recent messages and draft or send email on your behalf.",
  },
  {
    slug: "googledocs",
    label: "Google Docs",
    blurb: "Read existing docs and create new ones in your Drive.",
  },
  {
    slug: "googlesheets",
    label: "Google Sheets",
    blurb: "Read cells, append rows, and create sheets when you ask.",
  },
  {
    slug: "googledrive",
    label: "Google Drive",
    blurb: "Search your Drive and pull file contents into the conversation.",
  },
  {
    slug: "googlecalendar",
    label: "Google Calendar",
    blurb: "Check your schedule and create events when you ask.",
  },
  {
    slug: "slack",
    label: "Slack",
    blurb: "Send messages to channels or DMs and look up recent conversations.",
  },
  {
    slug: "clickup",
    label: "ClickUp",
    blurb: "Create tasks, look up lists, and update statuses in your workspace.",
  },
  {
    slug: "outlook",
    label: "Outlook",
    blurb: "Read recent mail and draft or send email from your Outlook account.",
  },
];

function statusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Connected";
    case "INITIATED":
    case "INITIALIZING":
      return "Connecting…";
    case "EXPIRED":
      return "Expired";
    case "REVOKED":
      return "Revoked";
    case "FAILED":
      return "Failed";
    case "INACTIVE":
      return "Inactive";
    default:
      return status;
  }
}

export function ConnectorsManager() {
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await listConnections();
      setConnections(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load connections.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await listConnections();
        if (!cancelled) setConnections(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleConnect = async (slug: string) => {
    setError(null);
    setBusySlug(slug);
    try {
      const { redirectUrl } = await startConnection(slug);
      if (!redirectUrl) {
        throw new Error("Composio did not return a redirect URL.");
      }
      popupRef.current = window.open(
        redirectUrl,
        "composio-oauth",
        "width=520,height=720"
      );

      // Poll until either the popup closes or the connection becomes ACTIVE.
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = window.setInterval(async () => {
        const closed = popupRef.current?.closed ?? false;
        await refresh();
        const active = (await listConnections()).some(
          (c) => c.toolkit === slug && c.status === "ACTIVE"
        );
        if (active || closed) {
          if (pollTimerRef.current) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          setBusySlug(null);
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed.");
      setBusySlug(null);
    }
  };

  const handleDisconnect = async (connection: ConnectionSummary) => {
    setError(null);
    setBusySlug(connection.toolkit);
    try {
      await removeConnection(connection.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed.");
    } finally {
      setBusySlug(null);
    }
  };

  const byToolkit = new Map<string, ConnectionSummary>();
  for (const c of connections) {
    const existing = byToolkit.get(c.toolkit);
    if (!existing || (existing.status !== "ACTIVE" && c.status === "ACTIVE")) {
      byToolkit.set(c.toolkit, c);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h3 className="mb-1 text-sm font-normal text-app">Connectors</h3>
        <p className="text-sm font-normal leading-relaxed text-app-muted">
          Connect apps so ARIA can read from and write to them when you ask.
          Connections are scoped to your account.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <ul className="space-y-2">
        {SUPPORTED_APPS.map((app) => {
          const connection = byToolkit.get(app.slug);
          const isActive = connection?.status === "ACTIVE" && !connection.isDisabled;
          const busy = busySlug === app.slug;
          return (
            <li
              key={app.slug}
              className="flex items-start gap-3 rounded-xl border border-app bg-surface px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-normal text-app">{app.label}</p>
                  {connection ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        isActive
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-app/40 text-app-muted"
                      }`}
                    >
                      {statusLabel(connection.status)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-app-muted">
                  {app.blurb}
                </p>
              </div>
              {isActive && connection ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDisconnect(connection)}
                  className="shrink-0 rounded-lg border border-app px-3 py-1.5 text-xs font-normal text-app-secondary transition-colors hover:bg-surface-hover hover:text-app disabled:opacity-50"
                >
                  {busy ? "…" : "Disconnect"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => void handleConnect(app.slug)}
                  className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-normal text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Opening…" : "Connect"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
