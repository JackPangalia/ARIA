"use client";

import { useEffect, useState } from "react";
import { getUsage } from "@/lib/plan/client";
import type { UsageSummary } from "@/lib/plan/types";
import { PLANS, TIERS, type Tier } from "@/lib/plan/tiers";
import { openBillingPortal, startCheckout } from "@/lib/billing/client";
import { PAID_TIERS, type PaidTier } from "@/lib/plan/tiers";
import { GrokSettingsButton } from "@/components/settings/SettingsRow";

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
      <div className="grok-plan-hero">
        <div className="min-w-0">
          <p className="grok-plan-hero-name">
            {PLANS[currentTier].display.name}
          </p>
          <p className="grok-plan-hero-sub">
            {currentTier === "free"
              ? "Free plan"
              : `$${PLANS[currentTier].display.priceMonthlyUsd}/month · ${PLANS[currentTier].display.tagline}`}
          </p>
        </div>
        {currentTier !== "free" ? (
          <GrokSettingsButton
            disabled={busy !== null}
            onClick={() => void handlePortal()}
          >
            {busy === "portal" ? "Opening…" : "Manage billing"}
          </GrokSettingsButton>
        ) : null}
      </div>

      {error ? (
        <p className="grok-settings-delete-error mt-3 text-xs">{error}</p>
      ) : null}

      <p className="grok-settings-section-title mt-8">Available plans</p>

      <div className="grok-card-stack">
        {PAID_TIER_LIST.map((tier) => {
          const { display } = PLANS[tier];
          const isCurrent = tier === currentTier;
          const isDowngrade = tierRank(tier) < currentRank;
          return (
            <div
              key={tier}
              className="grok-plan-card"
              data-featured={display.featured && !isCurrent}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="grok-plan-name">{display.name}</span>
                  {isCurrent ? (
                    <span className="grok-current-badge">Current plan</span>
                  ) : null}
                </div>
                <p className="grok-plan-price">
                  ${display.priceMonthlyUsd}/month · {display.tagline}
                </p>
                <ul className="grok-plan-bullets">
                  {display.featureBullets.slice(0, 3).map((bullet) => (
                    <li key={bullet}>
                      <span aria-hidden className="grok-plan-bullet-dot" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
              {isCurrent ? null : (
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
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
