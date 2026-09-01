"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getUsage } from "@/lib/plan/client";
import type { UsageSummary } from "@/lib/plan/types";
import { useAriaStore } from "@/lib/store";

function formatHm(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function StatCard(props: {
  label: string;
  value: ReactNode;
  pct: number;
  danger: boolean;
  sub: string;
}) {
  return (
    <div className="grok-stat-card">
      <p className="grok-stat-label">{props.label}</p>
      <p className="grok-stat-value">{props.value}</p>
      <div className="grok-meter-track">
        <div
          className="grok-meter-fill"
          data-danger={props.danger}
          style={{ width: `${Math.min(100, Math.max(2, props.pct))}%` }}
        />
      </div>
      <p className="grok-stat-sub">{props.sub}</p>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="grok-stat-card" aria-busy="true">
      <div className="kivo-skeleton h-3 w-20 rounded-full" />
      <div className="kivo-skeleton h-6 w-24 rounded-full" />
      <div className="kivo-skeleton h-1.5 w-full rounded-full" />
      <div className="kivo-skeleton h-3 w-28 rounded-full" />
    </div>
  );
}

export function UsageMeter() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const status = useAriaStore((s) => s.status);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getUsage()
        .then((data) => {
          if (!cancelled) setUsage(data);
        })
        .catch(() => {
          // Best-effort; the meter is non-critical UI.
        });
    };
    refresh();
    const interval = setInterval(refresh, 20_000);
    const onRefresh = () => refresh();
    window.addEventListener("kivo:usage-refresh", onRefresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("kivo:usage-refresh", onRefresh);
    };
    // Re-run (refetch) whenever listening status changes — e.g. after stop/ask.
  }, [status]);

  if (!usage) {
    return (
      <div className="grok-stat-grid">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    );
  }

  const periodUnit = usage.periodUnit ?? (usage.tier === "free" ? "week" : "month");
  const periodNoun = periodUnit === "week" ? "week" : "month";
  const topUpText =
    usage.topUpRemainingSeconds > 0
      ? ` (+${formatHm(usage.topUpRemainingSeconds)} top-up)`
      : "";

  const listeningSub = usage.listening.exhausted
    ? "Used up — upgrade or buy top-up hours"
    : `${formatHm(usage.listening.remainingSeconds)} left this ${periodNoun}${topUpText}`;

  const asksSub = usage.asks.exhausted
    ? "Used up — upgrade for more asks"
    : `of this ${periodNoun}'s allowance used`;

  return (
    <div className="grok-stat-grid">
      <StatCard
        label="Listening"
        value={
          <>
            {formatHm(usage.listening.usedSeconds)}{" "}
            <span className="grok-stat-cap">
              / {formatHm(usage.listening.capSeconds)}
            </span>
          </>
        }
        pct={usage.listening.pct}
        danger={usage.listening.pct >= 90}
        sub={listeningSub}
      />
      <StatCard
        label="Kivo asks"
        value={`${usage.asks.pct}%`}
        pct={usage.asks.pct}
        danger={usage.asks.pct >= 90}
        sub={asksSub}
      />
    </div>
  );
}
