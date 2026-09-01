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
import { emptyUsage, type UsageDoc, type UserPlanDoc } from "@/lib/plan/types";

function usage(patch: Partial<UsageDoc> = {}): UsageDoc {
  return { ...emptyUsage("2026-W35"), ...patch };
}

describe("listening limits", () => {
  it("free tier has 45 minutes = 2700 seconds per week", () => {
    expect(remainingListeningSeconds(planLimits("free"), usage())).toBe(2_700);
  });

  it("reports exhausted once the cap is reached without top-ups", () => {
    const limits = planLimits("free");
    expect(listeningExhausted(limits, usage({ listeningSeconds: 2_699 }))).toBe(false);
    expect(listeningExhausted(limits, usage({ listeningSeconds: 2_700 }))).toBe(true);
    expect(listeningExhausted(limits, usage({ listeningSeconds: 99_999 }))).toBe(true);
  });

  it("includes top-up balance in remaining listening seconds", () => {
    const limits = planLimits("pro");
    const plan: UserPlanDoc = {
      tier: "pro",
      billingAnchorDay: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      topUpListeningSeconds: 5 * 3600, // 5h top-up
    };
    // Pro has 15h (54,000s) + 5h (18,000s) = 72,000s total
    expect(remainingListeningSeconds(limits, usage({ listeningSeconds: 0 }), plan)).toBe(72_000);
    expect(remainingListeningSeconds(limits, usage({ listeningSeconds: 54_000 }), plan)).toBe(18_000);
    expect(listeningExhausted(limits, usage({ listeningSeconds: 54_000 }), plan)).toBe(false);
    expect(remainingListeningSeconds(limits, usage({ listeningSeconds: 60_000 }), plan)).toBe(18_000);
  });

  it("scales with tier (Pro = 15h, Power = 45h)", () => {
    expect(remainingListeningSeconds(planLimits("pro"), usage())).toBe(15 * 60 * 60);
    expect(remainingListeningSeconds(planLimits("power"), usage())).toBe(45 * 60 * 60);
  });
});

describe("ask soft backstop", () => {
  it("only trips at/over the token budget (Free = 200k, Pro = 3M, Power = 8M)", () => {
    const freeLimits = planLimits("free");
    expect(askTokensExhausted(freeLimits, usage({ askTokens: 199_999 }))).toBe(false);
    expect(askTokensExhausted(freeLimits, usage({ askTokens: 200_000 }))).toBe(true);

    const proLimits = planLimits("pro");
    expect(askTokensExhausted(proLimits, usage({ askTokens: 2_999_999 }))).toBe(false);
    expect(askTokensExhausted(proLimits, usage({ askTokens: 3_000_000 }))).toBe(true);
  });
});

describe("speaker profile limits", () => {
  it("every tier shares the same 25-profile safety cap", () => {
    expect(canCreateSpeakerProfile(planLimits("free"), 0)).toBe(true);
    expect(canCreateSpeakerProfile(planLimits("free"), 24)).toBe(true);
    expect(canCreateSpeakerProfile(planLimits("free"), 25)).toBe(false);
    expect(canCreateSpeakerProfile(planLimits("pro"), 24)).toBe(true);
    expect(canCreateSpeakerProfile(planLimits("pro"), 25)).toBe(false);
  });
});

describe("speaker recognition (standard across all tiers)", () => {
  it("all tiers have unlimited speaker recognition (null cap)", () => {
    expect(remainingSpeakerSeconds(planLimits("free"), usage())).toBeNull();
    expect(speakerModeExhausted(planLimits("free"), usage({ speakerSeconds: 999_999 }))).toBe(false);
    expect(remainingSpeakerSeconds(planLimits("pro"), usage())).toBeNull();
    expect(speakerModeExhausted(planLimits("pro"), usage({ speakerSeconds: 999_999 }))).toBe(false);
  });
});

describe("default transcription mode", () => {
  it("always resolves to speaker diarization mode", () => {
    expect(effectiveDefaultTranscriptionMode("free", null)).toBe("speaker");
    expect(effectiveDefaultTranscriptionMode("free", "speaker")).toBe("speaker");
    expect(effectiveDefaultTranscriptionMode("pro", null)).toBe("speaker");
    expect(effectiveDefaultTranscriptionMode("power", "speaker")).toBe("speaker");
  });
});

describe("connector limits", () => {
  it("free caps at 1, pro and power are unlimited", () => {
    expect(canAddConnector(planLimits("free"), 0)).toBe(true);
    expect(canAddConnector(planLimits("free"), 1)).toBe(false);
    expect(canAddConnector(planLimits("pro"), 50)).toBe(true);
    expect(canAddConnector(planLimits("power"), 50)).toBe(true);
  });
});

describe("history cutoff", () => {
  const now = new Date("2026-06-20T00:00:00Z");

  it("free hides sessions older than 30 days", () => {
    expect(historyCutoffIso(planLimits("free"), now)).toBe("2026-05-21T00:00:00.000Z");
  });

  it("pro and power are unlimited (null cutoff)", () => {
    expect(historyCutoffIso(planLimits("pro"), now)).toBeNull();
    expect(historyCutoffIso(planLimits("power"), now)).toBeNull();
  });
});

describe("usageSummary", () => {
  it("computes percentages and exhaustion flags", () => {
    const summary = usageSummary(
      "free",
      PLANS.free.limits,
      usage({ listeningSeconds: 1_350, askTokens: 100_000 })
    );
    expect(summary.listening.pct).toBe(50);
    expect(summary.listening.remainingSeconds).toBe(1_350);
    expect(summary.listening.exhausted).toBe(false);
    expect(summary.asks.pct).toBe(50);
    expect(summary.periodUnit).toBe("week");
  });
});
