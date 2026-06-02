import { describe, expect, it } from "vitest";
import {
  anchorDayFromDate,
  clampAnchorDay,
  currentPeriodKey,
  periodEnd,
  periodStart,
} from "@/lib/plan/period";

describe("clampAnchorDay", () => {
  it("clamps into 1–28", () => {
    expect(clampAnchorDay(0)).toBe(1);
    expect(clampAnchorDay(31)).toBe(28);
    expect(clampAnchorDay(15)).toBe(15);
    expect(clampAnchorDay(NaN)).toBe(1);
    expect(clampAnchorDay(15.9)).toBe(15);
  });
});

describe("anchorDayFromDate", () => {
  it("uses the UTC day-of-month, clamped to 28", () => {
    expect(anchorDayFromDate(new Date("2026-06-15T10:00:00Z"))).toBe(15);
    expect(anchorDayFromDate(new Date("2026-01-31T10:00:00Z"))).toBe(28);
  });
});

describe("periodStart / currentPeriodKey", () => {
  it("uses this month's anchor when now is on/after it", () => {
    const now = new Date("2026-06-20T12:00:00Z");
    expect(periodStart(15, now).toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(currentPeriodKey(15, now)).toBe("2026-06");
  });

  it("rolls back to last month's anchor when now is before it", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    expect(periodStart(15, now).toISOString()).toBe("2026-05-15T00:00:00.000Z");
    expect(currentPeriodKey(15, now)).toBe("2026-05");
  });

  it("handles the exact anchor instant as the start of the new period", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    expect(currentPeriodKey(15, now)).toBe("2026-06");
  });

  it("crosses the year boundary", () => {
    const now = new Date("2026-01-05T12:00:00Z");
    expect(periodStart(15, now).toISOString()).toBe("2025-12-15T00:00:00.000Z");
    expect(currentPeriodKey(15, now)).toBe("2025-12");
  });
});

describe("periodEnd", () => {
  it("is the anchor of the following month", () => {
    const now = new Date("2026-06-20T12:00:00Z");
    expect(periodEnd(15, now).toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("crosses the year boundary", () => {
    const now = new Date("2026-12-20T12:00:00Z");
    expect(periodEnd(15, now).toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });
});
