"use client";

import { useEffect, useState } from "react";
import { getUsage } from "@/lib/plan/client";
import type { UsageSummary } from "@/lib/plan/types";
import { PLANS, TIERS, type Tier } from "@/lib/plan/tiers";
import { openBillingPortal, startCheckout } from "@/lib/billing/client";
import { PAID_TIERS, type PaidTier } from "@/lib/plan/tiers";
import {
  GrokSettingsButton,
  GrokSettingsRow,
} from "@/components/settings/SettingsRow";

const PAID_TIER_LIST: PaidTier[] = [...PAID_TIERS];

function tierRank(tier: Tier): number {
  return TIERS.indexOf(tier);
}

export function BillingPanel() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [busy, setBusy] = useState<PaidTier | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getUsage()
      .then((data) => {
        if (!cancelled) setUsage(data);
      })
      .catch(() => {
        // Non-critical.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentTier = usage?.tier ?? "free";
  const currentRank = tierRank(currentTier);

  const redirectTo = (url: string) => {
    // Full-page redirect to Stripe-hosted Checkout / Portal.
    globalThis.location.assign(url);
  };

  const handleCheckout = async (tier: PaidTier) => {
    setBusy(tier);
    setError(null);
    try {
      const url = await startCheckout(tier);
      redirectTo(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setBusy(null);
    }
  };

  const handlePortal = async () => {
    setBusy("portal");
    setError(null);
    try {
      const url = await openBillingPortal();
      redirectTo(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing portal.");
      setBusy(null);
    }
  };

  return (
    <section>
      <p className="grok-settings-section-title">Billing</p>
      <p className="grok-settings-section-desc">
        Your plan controls listening hours and session history limits.
      </p>

      <GrokSettingsRow
        title={<span className="font-medium">{PLANS[currentTier].display.name}</span>}
        description={
          currentTier === "free"
            ? "Free plan"
            : `$${PLANS[currentTier].display.priceMonthlyUsd}/month`
        }
        action={
          currentTier !== "free" ? (
            <GrokSettingsButton
              disabled={busy !== null}
              onClick={() => void handlePortal()}
            >
              {busy === "portal" ? "Opening…" : "Manage billing"}
            </GrokSettingsButton>
          ) : undefined
        }
      />

      {error ? (
        <p className="grok-settings-delete-error mt-2 text-xs">{error}</p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2">
        {PAID_TIER_LIST.map((tier) => {
          const { display } = PLANS[tier];
          const isCurrent = tier === currentTier;
          const isDowngrade = tierRank(tier) < currentRank;
          return (
            <GrokSettingsRow
              key={tier}
              title={<span className="font-medium">{display.name}</span>}
              description={`$${display.priceMonthlyUsd}/month · ${display.tagline}`}
              action={
                isCurrent ? (
                  <span className="text-xs text-app-muted">Current plan</span>
                ) : (
                  <GrokSettingsButton
                    disabled={busy !== null}
                    onClick={() => void handleCheckout(tier)}
                  >
                    {busy === tier
                      ? "Redirecting…"
                      : isDowngrade
                        ? "Switch plan"
                        : `Choose ${display.name}`}
                  </GrokSettingsButton>
                )
              }
            />
          );
        })}
      </div>
    </section>
  );
}
