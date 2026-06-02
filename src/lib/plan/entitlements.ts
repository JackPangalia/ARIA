/**
 * Pure entitlement helpers. No Firestore, no I/O — given a plan's limits and the
 * current period's usage, decide what the user may do. Fully unit-testable.
 */

import type { PlanLimits, Tier } from "@/lib/plan/tiers";
import type { UsageDoc, UsageSummary } from "@/lib/plan/types";

function clampPct(used: number, cap: number): number {
  if (cap <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((used / cap) * 100)));
}

export function listeningCapSeconds(limits: PlanLimits): number {
  return limits.listeningMinutesPerMonth * 60;
}

export function remainingListeningSeconds(
  limits: PlanLimits,
  usage: UsageDoc
): number {
  return Math.max(0, listeningCapSeconds(limits) - usage.listeningSeconds);
}

export function listeningExhausted(limits: PlanLimits, usage: UsageDoc): boolean {
  return remainingListeningSeconds(limits, usage) <= 0;
}

/** Asks are a SOFT backstop — only "exhausted" once fully over the generous budget. */
export function askTokensExhausted(limits: PlanLimits, usage: UsageDoc): boolean {
  return usage.askTokens >= limits.askTokensPerMonth;
}

export function canCreateSpeakerProfile(
  limits: PlanLimits,
  currentCount: number
): boolean {
  if (limits.maxSpeakerProfiles === null) return true;
  return currentCount < limits.maxSpeakerProfiles;
}

export function canAddConnector(
  limits: PlanLimits,
  currentCount: number
): boolean {
  if (limits.maxConnectors === null) return true;
  return currentCount < limits.maxConnectors;
}

/**
 * ISO timestamp before which sessions are hidden for this tier (hide-on-read, never
 * deleted). `null` = unlimited history, show everything.
 */
export function historyCutoffIso(limits: PlanLimits, now: Date): string | null {
  if (limits.historyRetentionDays === null) return null;
  const cutoff = new Date(
    now.getTime() - limits.historyRetentionDays * 24 * 60 * 60 * 1000
  );
  return cutoff.toISOString();
}

export function usageSummary(
  tier: Tier,
  limits: PlanLimits,
  usage: UsageDoc
): UsageSummary {
  const capSeconds = listeningCapSeconds(limits);
  const remaining = remainingListeningSeconds(limits, usage);
  return {
    tier,
    periodKey: usage.periodKey,
    listening: {
      usedSeconds: usage.listeningSeconds,
      capSeconds,
      remainingSeconds: remaining,
      pct: clampPct(usage.listeningSeconds, capSeconds),
      exhausted: remaining <= 0,
    },
    asks: {
      usedTokens: usage.askTokens,
      capTokens: limits.askTokensPerMonth,
      pct: clampPct(usage.askTokens, limits.askTokensPerMonth),
      exhausted: askTokensExhausted(limits, usage),
    },
  };
}
