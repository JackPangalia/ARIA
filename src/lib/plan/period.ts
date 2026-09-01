/**
 * Billing period calculation for Free (weekly) and Paid (monthly anchor) tiers.
 *
 * - Free tier: Weekly period running [Monday 00:00 UTC, next Monday 00:00 UTC).
 *   Keyed by ISO week string e.g. "2026-W35".
 * - Paid tiers: Rolling monthly periods running [anchorDay 00:00 UTC, next anchorDay 00:00 UTC).
 *   Keyed by start date's year-month e.g. "2026-06".
 *
 * Pure module — no Firestore, fully unit-testable.
 */

import type { Tier } from "@/lib/plan/tiers";

/** Anchor is clamped to 1–28 so it exists in every month (no Feb-30 edge cases). */
export function clampAnchorDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(28, Math.max(1, Math.trunc(day)));
}

/** Day-of-month (1–28) of a date, clamped — used to derive a default anchor at signup. */
export function anchorDayFromDate(date: Date): number {
  return clampAnchorDay(date.getUTCDate());
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Returns the start of the UTC ISO week (Monday 00:00:00.000 UTC). */
export function weekStart(now: Date = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay(); // 0 is Sunday, 1 is Monday
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** Returns the end of the UTC ISO week (next Monday 00:00:00.000 UTC). */
export function weekEnd(now: Date = new Date()): Date {
  const start = weekStart(now);
  return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/** Stable key for the ISO week (e.g. "2026-W35") used as the Free tier usage doc id. */
export function currentWeekPeriodKey(now: Date = new Date()): string {
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // ISO week starts on Monday (1) to Sunday (7). In JS getUTCDay(), Sunday is 0.
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() + 3 - dayNr);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.getTime()) / (7 * 24 * 3600 * 1000));
  const year = new Date(firstThursday).getUTCFullYear();
  return `${year}-W${pad2(weekNumber)}`;
}

/** The UTC instant the current monthly period started, given an anchor day and "now". */
export function periodStart(anchorDay: number, now: Date): Date {
  const anchor = clampAnchorDay(anchorDay);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const startThisMonth = Date.UTC(year, month, anchor, 0, 0, 0, 0);
  if (now.getTime() >= startThisMonth) {
    return new Date(startThisMonth);
  }
  // Before this month's anchor → period started on the previous month's anchor.
  return new Date(Date.UTC(year, month - 1, anchor, 0, 0, 0, 0));
}

/** The UTC instant the current monthly period ends (start of the next period). */
export function periodEnd(anchorDay: number, now: Date): Date {
  const start = periodStart(anchorDay, now);
  return new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth() + 1,
      clampAnchorDay(anchorDay),
      0,
      0,
      0,
      0
    )
  );
}

/** Stable key (year-month of the period start) used as the paid usage doc id. */
export function currentPeriodKey(anchorDay: number, now: Date): string {
  const start = periodStart(anchorDay, now);
  return `${start.getUTCFullYear()}-${pad2(start.getUTCMonth() + 1)}`;
}

/** Returns the period key for a given tier: weekly for free, monthly for paid. */
export function periodKeyForTier(tier: Tier, anchorDay: number, now: Date = new Date()): string {
  if (tier === "free") {
    return currentWeekPeriodKey(now);
  }
  return currentPeriodKey(anchorDay, now);
}
