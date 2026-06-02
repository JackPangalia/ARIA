import { describe, expect, it } from "vitest";
import {
  askTokensExhausted,
  canAddConnector,
  canCreateSpeakerProfile,
  historyCutoffIso,
  listeningExhausted,
  remainingListeningSeconds,
  usageSummary,
} from "@/lib/plan/entitlements";
import { planLimits, PLANS } from "@/lib/plan/tiers";
import { emptyUsage, type UsageDoc } from "@/lib/plan/types";

function usage(patch: Partial<UsageDoc> = {}): UsageDoc {
  return { ...emptyUsage("2026-06"), ...patch };
}

describe("listening limits", () => {
  it("free tier has 3 hours = 10800 seconds", () => {
    expect(remainingListeningSeconds(planLimits("free"), usage())).toBe(10_800);
  });

  it("reports exhausted once the cap is reached", () => {
    const limits = planLimits("free");
    expect(listeningExhausted(limits, usage({ listeningSeconds: 10_799 }))).toBe(false);
    expect(listeningExhausted(limits, usage({ listeningSeconds: 10_800 }))).toBe(true);
    expect(listeningExhausted(limits, usage({ listeningSeconds: 99_999 }))).toBe(true);
  });

  it("scales with tier", () => {
    expect(remainingListeningSeconds(planLimits("max"), usage())).toBe(60 * 60 * 60);
  });
});

describe("ask soft backstop", () => {
  it("only trips at/over the token budget", () => {
    const limits = planLimits("plus");
    expect(askTokensExhausted(limits, usage({ askTokens: 1_499_999 }))).toBe(false);
    expect(askTokensExhausted(limits, usage({ askTokens: 1_500_000 }))).toBe(true);
  });
});

describe("speaker profile limits", () => {
  it("free caps at 5", () => {
    const limits = planLimits("free");
    expect(canCreateSpeakerProfile(limits, 4)).toBe(true);
    expect(canCreateSpeakerProfile(limits, 5)).toBe(false);
  });

  it("plus and above are unlimited", () => {
    expect(canCreateSpeakerProfile(planLimits("plus"), 999)).toBe(true);
  });
});

describe("connector limits", () => {
  it("free caps at 1, plus at 3, pro+ unlimited", () => {
    expect(canAddConnector(planLimits("free"), 0)).toBe(true);
    expect(canAddConnector(planLimits("free"), 1)).toBe(false);
    expect(canAddConnector(planLimits("plus"), 2)).toBe(true);
    expect(canAddConnector(planLimits("plus"), 3)).toBe(false);
    expect(canAddConnector(planLimits("pro"), 50)).toBe(true);
  });
});

describe("history cutoff", () => {
  const now = new Date("2026-06-20T00:00:00Z");

  it("free hides sessions older than 30 days", () => {
    expect(historyCutoffIso(planLimits("free"), now)).toBe("2026-05-21T00:00:00.000Z");
  });

  it("plus uses a 1-year window", () => {
    expect(historyCutoffIso(planLimits("plus"), now)).toBe("2025-06-20T00:00:00.000Z");
  });

  it("pro and max are unlimited (null cutoff)", () => {
    expect(historyCutoffIso(planLimits("pro"), now)).toBeNull();
    expect(historyCutoffIso(planLimits("max"), now)).toBeNull();
  });
});

describe("usageSummary", () => {
  it("computes percentages and exhaustion flags", () => {
    const summary = usageSummary(
      "free",
      PLANS.free.limits,
      usage({ listeningSeconds: 5_400, askTokens: 375_000 })
    );
    expect(summary.listening.pct).toBe(50);
    expect(summary.listening.remainingSeconds).toBe(5_400);
    expect(summary.listening.exhausted).toBe(false);
    expect(summary.asks.pct).toBe(50);
  });
});
