/**
 * Pure entitlement helpers. No Firestore, no I/O — given a plan's limits and the
 * current period's usage, decide what the user may do. Fully unit-testable.
 */

import type { PlanLimits, Tier } from "@/lib/plan/tiers";
import type { UsageDoc, UsageSummary, UserPlanDoc } from "@/lib/plan/types";
import { periodEnd, weekEnd } from "@/lib/plan/period";

function clampPct(used: number, cap: number): number {
  if (cap <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((used / cap) * 100)));
}

export function listeningCapSeconds(limits: PlanLimits): number {
  return limits.listeningMinutesPerMonth * 60;
}

export function remainingListeningSeconds(
  limits: PlanLimits,
  usage: UsageDoc,
  plan?: UserPlanDoc | null
): number {
  const baseRemaining = Math.max(0, listeningCapSeconds(limits) - usage.listeningSeconds);
  const topUpRemaining = Math.max(0, Number(plan?.topUpListeningSeconds ?? 0));
  return baseRemaining + topUpRemaining;
}

export function listeningExhausted(
  limits: PlanLimits,
  usage: UsageDoc,
  plan?: UserPlanDoc | null
): boolean {
  return remainingListeningSeconds(limits, usage, plan) <= 0;
}

/** `null` = unlimited Speaker recognition minutes for this tier. */
export function speakerCapSeconds(limits: PlanLimits): number | null {
  if (limits.speakerMinutesPerMonth === null) return null;
  return limits.speakerMinutesPerMonth * 60;
}

export function remainingSpeakerSeconds(
  limits: PlanLimits,
  usage: UsageDoc
): number | null {
  const cap = speakerCapSeconds(limits);
  if (cap === null) return null;
  return Math.max(0, cap - usage.speakerSeconds);
}

export function speakerModeExhausted(limits: PlanLimits, usage: UsageDoc): boolean {
  const remaining = remainingSpeakerSeconds(limits, usage);
  return remaining !== null && remaining <= 0;
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
  usage: UsageDoc,
  plan?: UserPlanDoc | null,
  now: Date = new Date()
): UsageSummary {
  const capSeconds = listeningCapSeconds(limits);
  const remaining = remainingListeningSeconds(limits, usage, plan);
  const topUpRemaining = Math.max(0, Number(plan?.topUpListeningSeconds ?? 0));
  const periodUnit = limits.periodUnit ?? (tier === "free" ? "week" : "month");
  const resetsAt =
    periodUnit === "week"
      ? weekEnd(now).toISOString()
      : periodEnd(plan?.billingAnchorDay ?? 1, now).toISOString();

  return {
    tier,
    periodKey: usage.periodKey,
    periodUnit,
    resetsAt,
    topUpRemainingSeconds: topUpRemaining,
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
