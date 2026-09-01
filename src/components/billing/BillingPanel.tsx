"use client";

import { useEffect, useState } from "react";
import { getUsage } from "@/lib/plan/client";
import type { UsageSummary } from "@/lib/plan/types";
import {
  PLANS,
  TIERS,
  TOP_UP_PACK_LIST,
  type PaidTier,
  type Tier,
} from "@/lib/plan/tiers";
import {
  buyTopUpPack,
  openBillingPortal,
  startCheckout,
} from "@/lib/billing/client";
import { GrokSettingsButton } from "@/components/settings/SettingsRow";

const ACTIVE_PAID_TIERS: PaidTier[] = ["pro", "power"];

function tierRank(tier: Tier): number {
  return TIERS.indexOf(tier);
}

function formatHm(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function BillingPanel() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");

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
    setBusy(`tier-${tier}`);
    setError(null);
    try {
      const url = await startCheckout(tier, billingInterval);
      redirectTo(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setBusy(null);
    }
  };

  const handleTopUp = async (packId: "starter_5h" | "pro_12h") => {
    setBusy(`topup-${packId}`);
    setError(null);
    try {
      const url = await buyTopUpPack(packId);
      redirectTo(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Top-up checkout failed.");
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

  const planConfig = PLANS[currentTier] ?? PLANS.free;

  return (
    <section className="space-y-6">
      {/* Current Plan Hero */}
      <div className="grok-plan-hero">
        <div className="min-w-0">
          <p className="grok-plan-hero-name">
            {planConfig.display.name}
          </p>
          <p className="grok-plan-hero-sub">
            {currentTier === "free"
              ? "Free plan · 45 minutes / week (refills weekly)"
              : `$${planConfig.display.priceMonthlyUsd}/month · ${planConfig.display.tagline}`}
          </p>
          {usage && usage.topUpRemainingSeconds > 0 ? (
            <p className="mt-1 text-xs font-medium text-emerald-400">
              +{formatHm(usage.topUpRemainingSeconds)} extra listening hours remaining (never expires)
            </p>
          ) : null}
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
        <p className="grok-settings-delete-error text-xs">{error}</p>
      ) : null}

      {/* Top-Up Packs Section */}
      <div>
        <p className="grok-settings-section-title">Listening Top-Up Packs</p>
        <p className="text-xs text-app-muted mb-3">
          Need extra hours without upgrading your plan? Add pre-paid listening time that never expires.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TOP_UP_PACK_LIST.map((pack) => (
            <div
              key={pack.id}
              className="rounded-xl border border-border/60 bg-surface/50 p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{pack.name}</span>
                  <span className="text-sm font-bold text-amber-500">${pack.priceUsd.toFixed(2)}</span>
                </div>
                <p className="text-xs text-app-muted mt-1">{pack.description}</p>
              </div>

              <GrokSettingsButton
                disabled={busy !== null}
                onClick={() => void handleTopUp(pack.id)}
              >
                {busy === `topup-${pack.id}` ? "Redirecting…" : `Buy +${pack.hoursAdded}h`}
              </GrokSettingsButton>
            </div>
          ))}
        </div>
      </div>

      {/* Available Plans Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="grok-settings-section-title">Upgrade Plan</p>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${billingInterval === "month" ? "font-semibold text-foreground" : "text-app-muted"}`}>
              Monthly
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={billingInterval === "year"}
              onClick={() => setBillingInterval((prev) => (prev === "month" ? "year" : "month"))}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                billingInterval === "year" ? "bg-amber-600" : "bg-neutral-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  billingInterval === "year" ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <span className={`text-xs flex items-center gap-1 ${billingInterval === "year" ? "font-semibold text-foreground" : "text-app-muted"}`}>
              Annual <span className="text-[10px] text-emerald-400 font-medium">Save 20%</span>
            </span>
          </div>
        </div>

        <div className="grok-card-stack">
          {ACTIVE_PAID_TIERS.map((tier) => {
            const { display } = PLANS[tier];
            const isCurrent = tier === currentTier;
            const isDowngrade = tierRank(tier) < currentRank;
            const price =
              billingInterval === "year"
                ? `$${Math.round((display.priceAnnualUsd ?? display.priceMonthlyUsd * 12) / 12)}/month ($${display.priceAnnualUsd}/yr)`
                : `$${display.priceMonthlyUsd}/month`;

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
                    {price} · {display.tagline}
                  </p>
                  <ul className="grok-plan-bullets">
                    {display.featureBullets.slice(0, 4).map((bullet) => (
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
                    {busy === `tier-${tier}`
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
      </div>
    </section>
  );
}
