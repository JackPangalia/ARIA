"use client";

import { useEffect, useState } from "react";
import { getUsage } from "@/lib/plan/client";
import type { UsageSummary } from "@/lib/plan/types";
import { useAriaStore } from "@/lib/store";

function formatHm(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Bar({
  label,
  detail,
  pct,
  danger,
}: {
  label: string;
  detail: string;
  pct: number;
  danger: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-[10px] tracking-[0.12em] text-app-muted">
        <span className="uppercase">{label}</span>
        <span className="tabular-nums">{detail}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            danger ? "bg-danger" : "bg-accent"
          }`}
          style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
        />
      </div>
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

  if (!usage) return null;

  return (
    <div className="flex w-full max-w-[19rem] flex-col gap-3">
      <Bar
        label="Listening"
        detail={`${formatHm(usage.listening.usedSeconds)} / ${formatHm(
          usage.listening.capSeconds
        )}`}
        pct={usage.listening.pct}
        danger={usage.listening.pct >= 90}
      />
      <Bar
        label="Asks"
        detail={`${usage.asks.pct}%`}
        pct={usage.asks.pct}
        danger={usage.asks.pct >= 90}
      />
    </div>
  );
}
