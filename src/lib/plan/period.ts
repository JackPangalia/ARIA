/**
 * Rolling monthly billing periods anchored to a per-user day-of-month.
 *
 * A user with `billingAnchorDay = 15` has periods running [15th 00:00 UTC, next
 * 15th 00:00 UTC). The period is keyed by the START date's year-month, e.g. a
 * period beginning 2026-06-15 has key "2026-06". All math is UTC for determinism.
 *
 * Pure module — no Firestore, fully unit-testable.
 */

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

/** The UTC instant the current period started, given an anchor day and "now". */
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

/** The UTC instant the current period ends (start of the next period). */
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

/** Stable key (year-month of the period start) used as the usage doc id. */
export function currentPeriodKey(anchorDay: number, now: Date): string {
  const start = periodStart(anchorDay, now);
  return `${start.getUTCFullYear()}-${pad2(start.getUTCMonth() + 1)}`;
}
