"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listConnections,
  removeConnection,
  startConnection,
  warmComposioTools,
  type ConnectionSummary,
} from "@/lib/composio/client-api";
import { ConnectorIcon } from "@/components/settings/ConnectorIcon";
import {
  GrokSettingsButton,
  SettingsGroup,
  SettingsRow,
} from "@/components/settings/SettingsRow";

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
      className="h-2 w-2 shrink-0 rounded-full bg-emerald-400"
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

function ConnectorRow(props: {
  app: ConnectorApp;
  connection: ConnectionSummary | undefined;
  isActive: boolean;
  busy: boolean;
  loading: boolean;
  last?: boolean;
  onConnect: (slug: string) => void;
  onDisconnect: (connection: ConnectionSummary) => void;
}) {
  const { app, connection, isActive, busy, loading } = props;

  return (
    <SettingsRow
      last={props.last}
      icon={<ConnectorIcon slug={app.slug} size={24} />}
      title={
        <span className="inline-flex items-center gap-2">
          {app.label}
          {isActive ? <ConnectedDot /> : null}
        </span>
      }
      description={connectorDescription(app, connection, isActive)}
      action={
        isActive && connection ? (
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
        )
      }
    />
  );
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

  const showConnectedLabel = connectedApps.length > 0;
  const showAvailableLabel = disconnectedApps.length > 0 && connectedApps.length > 0;

  return (
    <section>
      {error ? <p className="mb-4 text-[13px] text-danger">{error}</p> : null}

      {connectedApps.length > 0 ? (
        <SettingsGroup label={showConnectedLabel ? "Connected" : undefined}>
          {connectedApps.map((app, index) => (
            <ConnectorRow
              key={app.slug}
              app={app}
              connection={byToolkit.get(app.slug)}
              isActive
              busy={busySlug === app.slug}
              loading={loading}
              last={index === connectedApps.length - 1}
              onConnect={(slug) => void handleConnect(slug)}
              onDisconnect={(c) => void handleDisconnect(c)}
            />
          ))}
        </SettingsGroup>
      ) : null}
      {disconnectedApps.length > 0 ? (
        <SettingsGroup
          label={showAvailableLabel ? "Available" : undefined}
          className="mb-0"
        >
          {disconnectedApps.map((app, index) => (
            <ConnectorRow
              key={app.slug}
              app={app}
              connection={byToolkit.get(app.slug)}
              isActive={false}
              busy={busySlug === app.slug}
              loading={loading}
              last={index === disconnectedApps.length - 1}
              onConnect={(slug) => void handleConnect(slug)}
              onDisconnect={(c) => void handleDisconnect(c)}
            />
          ))}
        </SettingsGroup>
      ) : null}
    </section>
  );
}
