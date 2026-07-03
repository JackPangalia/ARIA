import { describe, expect, it } from "vitest";
import {
  askTokensExhausted,
  canAddConnector,
  canCreateSpeakerProfile,
  historyCutoffIso,
  listeningExhausted,
  remainingListeningSeconds,
  remainingSpeakerSeconds,
  speakerModeExhausted,
  usageSummary,
} from "@/lib/plan/entitlements";
import { effectiveDefaultTranscriptionMode } from "@/lib/plan/repository";
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
  it("every tier shares the same 25-profile safety cap", () => {
    expect(canCreateSpeakerProfile(planLimits("free"), 0)).toBe(true);
    expect(canCreateSpeakerProfile(planLimits("free"), 24)).toBe(true);
    expect(canCreateSpeakerProfile(planLimits("free"), 25)).toBe(false);
    expect(canCreateSpeakerProfile(planLimits("max"), 24)).toBe(true);
    expect(canCreateSpeakerProfile(planLimits("max"), 25)).toBe(false);
  });
});

describe("speaker recognition minutes (free tier allotment)", () => {
  it("free tier gets 2 hours = 7200 seconds", () => {
    expect(remainingSpeakerSeconds(planLimits("free"), usage())).toBe(7_200);
  });

  it("reports exhausted once the allotment is used up", () => {
    const limits = planLimits("free");
    expect(speakerModeExhausted(limits, usage({ speakerSeconds: 7_199 }))).toBe(false);
    expect(speakerModeExhausted(limits, usage({ speakerSeconds: 7_200 }))).toBe(true);
  });

  it("paid tiers are unlimited (null cap)", () => {
    expect(remainingSpeakerSeconds(planLimits("plus"), usage())).toBeNull();
    expect(speakerModeExhausted(planLimits("plus"), usage({ speakerSeconds: 999_999 }))).toBe(
      false
    );
  });
});

describe("default transcription mode", () => {
  it("free users default to basic when they haven't opted into speaker mode", () => {
    expect(effectiveDefaultTranscriptionMode("free", null)).toBe("basic");
    expect(effectiveDefaultTranscriptionMode("free", "basic")).toBe("basic");
  });

  it("free users get speaker mode while their monthly allotment remains", () => {
    const limits = planLimits("free");
    expect(effectiveDefaultTranscriptionMode("free", "speaker", limits, usage())).toBe(
      "speaker"
    );
  });

  it("free users fall back to basic once the speaker allotment is exhausted", () => {
    const limits = planLimits("free");
    expect(
      effectiveDefaultTranscriptionMode(
        "free",
        "speaker",
        limits,
        usage({ speakerSeconds: 7_200 })
      )
    ).toBe("basic");
  });

  it("lets paid users choose basic or speaker mode", () => {
    expect(effectiveDefaultTranscriptionMode("plus", "basic")).toBe("basic");
    expect(effectiveDefaultTranscriptionMode("plus", "speaker")).toBe("speaker");
    expect(effectiveDefaultTranscriptionMode("plus", null)).toBe("speaker");
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
