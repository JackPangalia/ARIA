"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  listConnections,
  removeConnection,
  startConnection,
  warmComposioTools,
  type ConnectionSummary,
} from "@/lib/composio/client-api";
import { ConnectorIcon } from "@/components/settings/ConnectorIcon";
import { GrokSettingsButton } from "@/components/settings/SettingsRow";

const SUPPORTED_APPS: { slug: string; label: string; blurb: string }[] = [
  {
    slug: "notion",
    label: "Notion",
    blurb: "Read pages and create new ones in your workspace.",
  },
  {
    slug: "gmail",
    label: "Gmail",
    blurb: "Read recent messages and draft or send email.",
  },
  {
    slug: "googledocs",
    label: "Google Docs",
    blurb: "Read docs and create new ones in Drive.",
  },
  {
    slug: "googlesheets",
    label: "Google Sheets",
    blurb: "Read cells, append rows, and create sheets.",
  },
  {
    slug: "googledrive",
    label: "Google Drive",
    blurb: "Search Drive and pull file contents into chat.",
  },
  {
    slug: "googlecalendar",
    label: "Google Calendar",
    blurb: "Check your schedule and create events.",
  },
  {
    slug: "slack",
    label: "Slack",
    blurb: "Send messages and look up conversations.",
  },
  {
    slug: "clickup",
    label: "ClickUp",
    blurb: "Create tasks and update statuses.",
  },
  {
    slug: "outlook",
    label: "Outlook",
    blurb: "Read mail and draft or send from Outlook.",
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

function isConnected(
  slug: string,
  byToolkit: Map<string, ConnectionSummary>
): boolean {
  const connection = byToolkit.get(slug);
  return Boolean(connection?.status === "ACTIVE" && !connection.isDisabled);
}

type ConnectorApp = (typeof SUPPORTED_APPS)[number];

function ConnectedDot() {
  return (
    <span
      className="grok-connector-status-dot"
      aria-label="Connected"
      title="Connected"
    />
  );
}

function connectorDescription(
  app: ConnectorApp,
  connection: ConnectionSummary | undefined,
  isActive: boolean
): string {
  if (connection && !isActive) {
    return statusLabel(connection.status);
  }
  return app.blurb;
}

function GrokConnectorRow(props: {
  app: ConnectorApp;
  connection: ConnectionSummary | undefined;
  isActive: boolean;
  busy: boolean;
  loading: boolean;
  onConnect: (slug: string) => void;
  onDisconnect: (connection: ConnectionSummary) => void;
}) {
  const { app, connection, isActive, busy, loading } = props;

  return (
    <div className="grok-connector-row">
      <span className="grok-connector-icon">
        <ConnectorIcon slug={app.slug} size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="grok-connector-label">
          {app.label}
          {isActive ? <ConnectedDot /> : null}
        </div>
        <div className="grok-connector-blurb">
          {connectorDescription(app, connection, isActive)}
        </div>
      </div>
      {isActive && connection ? (
        <GrokSettingsButton
          variant="ghost-danger"
          disabled={busy}
          onClick={() => props.onDisconnect(connection)}
        >
          {busy ? "…" : "Disconnect"}
        </GrokSettingsButton>
      ) : (
        <GrokSettingsButton
          variant="primary"
          disabled={busy || loading}
          onClick={() => props.onConnect(app.slug)}
        >
          {busy ? "Opening…" : "Connect"}
        </GrokSettingsButton>
      )}
    </div>
  );
}

function GrokConnectorGroup(props: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="grok-connector-group">
      {props.label ? (
        <p className="grok-connector-group-label">{props.label}</p>
      ) : null}
      <div className="grok-connector-rows">{props.children}</div>
    </div>
  );
}

export function ConnectorsManager(props: { grok?: boolean }) {
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
          if (active) {
            void warmComposioTools().catch(() => {
              // Best-effort cache warm after OAuth; ask path still loads tools.
            });
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

  const byToolkit = useMemo(() => {
    const map = new Map<string, ConnectionSummary>();
    for (const c of connections) {
      const existing = map.get(c.toolkit);
      if (!existing || (existing.status !== "ACTIVE" && c.status === "ACTIVE")) {
        map.set(c.toolkit, c);
      }
    }
    return map;
  }, [connections]);

  const { connectedApps, disconnectedApps } = useMemo(() => {
    const connected: ConnectorApp[] = [];
    const disconnected: ConnectorApp[] = [];
    for (const app of SUPPORTED_APPS) {
      if (isConnected(app.slug, byToolkit)) {
        connected.push(app);
      } else {
        disconnected.push(app);
      }
    }
    return { connectedApps: connected, disconnectedApps: disconnected };
  }, [byToolkit]);

  const renderGrokGroups = () => {
    const showConnectedLabel = connectedApps.length > 0;
    const showAvailableLabel =
      disconnectedApps.length > 0 && connectedApps.length > 0;

    return (
      <div className="grok-connector-panel">
        {connectedApps.length > 0 ? (
          <GrokConnectorGroup
            label={showConnectedLabel ? "Connected" : undefined}
          >
            {connectedApps.map((app) => (
              <GrokConnectorRow
                key={app.slug}
                app={app}
                connection={byToolkit.get(app.slug)}
                isActive
                busy={busySlug === app.slug}
                loading={loading}
                onConnect={(slug) => void handleConnect(slug)}
                onDisconnect={(c) => void handleDisconnect(c)}
              />
            ))}
          </GrokConnectorGroup>
        ) : null}
        {disconnectedApps.length > 0 ? (
          <GrokConnectorGroup
            label={showAvailableLabel ? "Available" : undefined}
          >
            {disconnectedApps.map((app) => (
              <GrokConnectorRow
                key={app.slug}
                app={app}
                connection={byToolkit.get(app.slug)}
                isActive={false}
                busy={busySlug === app.slug}
                loading={loading}
                onConnect={(slug) => void handleConnect(slug)}
                onDisconnect={(c) => void handleDisconnect(c)}
              />
            ))}
          </GrokConnectorGroup>
        ) : null}
      </div>
    );
  };

  if (props.grok) {
    return (
      <section>
        <p className="grok-settings-section-title">Connectors</p>
        <p className="grok-settings-section-desc">
          Connect apps so Kivo can read from and write to them when you ask.
        </p>

        {error ? (
          <p className="mb-4 text-[13px] text-[#f87171]">{error}</p>
        ) : null}

        {renderGrokGroups()}
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h3 className="mb-1 text-sm font-normal text-app">Connectors</h3>
        <p className="text-sm font-normal leading-relaxed text-app-muted">
          Connect apps so Kivo can read from and write to them when you ask.
        </p>
      </div>
      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="space-y-4">
        {[connectedApps, disconnectedApps]
          .filter((group) => group.length > 0)
          .map((group, groupIndex) => (
            <div key={groupIndex} className="space-y-2">
              {connectedApps.length > 0 && disconnectedApps.length > 0 ? (
                <p className="px-0.5 text-xs text-app-muted">
                  {groupIndex === 0 ? "Connected" : "Available"}
                </p>
              ) : null}
              <ul className="space-y-1">
                {group.map((app) => {
                  const connection = byToolkit.get(app.slug);
                  const active = isConnected(app.slug, byToolkit);
                  const busy = busySlug === app.slug;
                  return (
                    <li
                      key={app.slug}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <ConnectorIcon slug={app.slug} size={24} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-app">{app.label}</p>
                          {active ? (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full bg-emerald-400"
                              aria-label="Connected"
                              title="Connected"
                            />
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-app-muted">
                          {connectorDescription(app, connection, active)}
                        </p>
                      </div>
                      {active && connection ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDisconnect(connection)}
                          className="shrink-0 rounded-full px-4 py-1.5 text-xs font-medium text-app-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-45"
                        >
                          {busy ? "…" : "Disconnect"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || loading}
                          onClick={() => void handleConnect(app.slug)}
                          className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-45"
                        >
                          {busy ? "Opening…" : "Connect"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </div>
    </section>
  );
}
