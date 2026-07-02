import { describe, expect, it } from "vitest";
import {
  retentionCutoffIso,
  selectExpiredSessions,
  type RetentionCandidate,
} from "@/lib/retention/select";

const NOW = new Date("2026-07-02T00:00:00Z");

function session(
  id: string,
  daysOld: number,
  overrides?: Partial<RetentionCandidate>
): RetentionCandidate {
  return {
    id,
    status: "ended",
    pinned: false,
    updatedAt: new Date(NOW.getTime() - daysOld * 86_400_000).toISOString(),
    ...overrides,
  };
}

describe("retentionCutoffIso", () => {
  it("returns null for unlimited retention", () => {
    expect(retentionCutoffIso(null, NOW)).toBeNull();
  });

  it("adds the grace buffer to the retention window", () => {
    expect(retentionCutoffIso(30, NOW, 7)).toBe(
      new Date(NOW.getTime() - 37 * 86_400_000).toISOString()
    );
  });
});

describe("selectExpiredSessions", () => {
  it("selects only sessions older than retention + grace", () => {
    const ids = selectExpiredSessions({
      sessions: [session("old", 40), session("edge", 37), session("fresh", 20)],
      retentionDays: 30,
      now: NOW,
    });
    expect(ids).toEqual(["old"]);
  });

  it("never selects pinned or active sessions regardless of age", () => {
    const ids = selectExpiredSessions({
      sessions: [
        session("pinned", 100, { pinned: true }),
        session("live", 100, { status: "active" }),
        session("trashed", 100, { status: "trashed" }),
      ],
      retentionDays: 30,
      now: NOW,
    });
    expect(ids).toEqual(["trashed"]);
  });

  it("selects nothing on unlimited-retention plans", () => {
    const ids = selectExpiredSessions({
      sessions: [session("ancient", 1000)],
      retentionDays: null,
      now: NOW,
    });
    expect(ids).toEqual([]);
  });
});
