import { describe, expect, it } from "vitest";
import {
  applyEducationMutation, chooseEducationTopic, educationIsQuiet, EducationMutationSchema,
  initialEducationState, EDUCATION_LAUNCH_AT, topicIsRelevant, type EducationActivity, type EducationAnchor, type EducationTopic,
} from "./model";
import { placeEducationTip, type Rect } from "./placement";

const release = EDUCATION_LAUNCH_AT;
const state = initialEducationState(release);
const activity: EducationActivity = { status: "idle", running: false, home: true, overview: false, blocked: false };
const choose = (overrides: Partial<Parameters<typeof chooseEducationTopic>[0]> = {}) => chooseEducationTopic({
  state, activity, available: new Set<EducationAnchor>(["start", "voice", "speaker", "overview"]),
  shown: new Set<EducationTopic>(), lastHiddenAt: null, now: 30_000, ...overrides,
});

describe("education enrollment and progress", () => {
  it("enrolls only accounts at or after the fixed release", () => {
    expect(initialEducationState(release).enabled).toBe(true);
    expect(initialEducationState("2026-08-28").enabled).toBe(true);
    expect(initialEducationState("2026-08-26").enabled).toBe(false);
    expect(initialEducationState(new Date(Date.parse(release) - 1).toISOString()).enabled).toBe(false);
    expect(initialEducationState("invalid").enabled).toBe(false);
  });
  it("merges retirements idempotently without losing other topics", () => {
    const a = applyEducationMutation(state, { action: "retire", topic: "speaker", generation: 0 });
    const b = applyEducationMutation(a, { action: "retire", topic: "wake", generation: 0 });
    expect(b.retired).toEqual(["speaker", "wake"]);
    expect(applyEducationMutation(b, { action: "retire", topic: "wake", generation: 0 })).toBe(b);
  });
  it("hides all guidance and allows an explicit fresh replay", () => {
    const hidden = applyEducationMutation(state, { action: "hide", generation: 0 });
    expect(choose({ state: hidden })).toBeNull();
    const replay = applyEducationMutation(hidden, { action: "restart" });
    expect(replay).toMatchObject({ enabled: true, retired: [], generation: 1 });
    expect(applyEducationMutation(replay, { action: "retire", topic: "wake", generation: 0 })).toBe(replay);
    expect(applyEducationMutation(replay, { action: "hide", generation: 0 })).toBe(replay);
  });
  it("rejects unknown topics, client ownership, and invalid generations", () => {
    for (const mutation of [
      { action: "retire", topic: "bot", generation: 0 },
      { action: "hide", generation: -1 },
      { action: "restart", uid: "someone-else" },
      { action: "retire", topic: "wake" },
    ]) expect(EducationMutationSchema.safeParse(mutation).success).toBe(false);
  });
});

describe("contextual scheduling", () => {
  it("previews immediately without account enrollment, saved progress, or cooldowns", () => {
    expect(choose({ state: null, preview: true, lastHiddenAt: 30_000 })).toBe("together");
    const saved = { ...state, enabled: false, retired: ["together" as const] };
    expect(choose({ state: saved, preview: true, shown: new Set(["speaker", "overview", "wake"]) })).toBe("together");
    expect(saved).toMatchObject({ enabled: false, retired: ["together"] });
  });
  it("preview still requires a real visible target and respects busy states", () => {
    expect(choose({ preview: true, available: new Set() })).toBeNull();
    expect(choose({ preview: true, activity: { ...activity, blocked: true } })).toBeNull();
    expect(choose({ preview: true, activity: { ...activity, status: "speaking" } })).toBeNull();
    expect(choose({ preview: true, shown: new Set(["together"]) })).toBeNull();
  });
  it("requires loaded eligibility and an available target", () => {
    expect(choose()).toBe("together");
    expect(choose({ state: null })).toBeNull();
    expect(choose({ available: new Set() })).toBeNull();
    expect(choose({ state: { ...state, enabled: false } })).toBeNull();
  });
  it("prioritizes a correctable visible speaker over Overview", () => {
    const overview = { ...activity, home: false, overview: true };
    expect(choose({ activity: overview })).toBe("speaker");
    // Basic mode, assistant lines, or a hidden transcript do not register a speaker anchor.
    expect(choose({ activity: overview, available: new Set(["overview"]) })).toBe("overview");
  });
  it("respects retirement, visit limits, and twenty seconds after disappearance", () => {
    expect(choose({ state: { ...state, retired: ["together"] } })).toBeNull();
    expect(choose({ shown: new Set(["together"]) })).toBeNull();
    expect(choose({ shown: new Set(["wake", "speaker", "overview"]) })).toBeNull();
    expect(choose({ lastHiddenAt: 10_001 })).toBeNull();
    expect(choose({ lastHiddenAt: 10_000 })).toBe("together");
    // A new visit can offer an interrupted (unretired) lesson again.
    expect(choose({ shown: new Set(), lastHiddenAt: null })).toBe("together");
  });
  it("suppresses guidance during every non-quiet engine state and UI blocker", () => {
    for (const status of ["wake-detected", "capturing-question", "thinking", "searching", "speaking", "error"] as const) {
      expect(educationIsQuiet({ ...activity, status })).toBe(false);
      expect(choose({ activity: { ...activity, status } })).toBeNull();
    }
    expect(choose({ activity: { ...activity, blocked: true } })).toBeNull();
  });
  it("teaches wake and follow-up only in their actual listening states", () => {
    const live = { ...activity, home: false, running: true, status: "listening" as const };
    expect(choose({ activity: live })).toBe("wake");
    expect(choose({ activity: { ...live, status: "follow-up-listening" } })).toBe("followup");
    expect(topicIsRelevant("speaker", live)).toBe(false);
    expect(topicIsRelevant("overview", live)).toBe(false);
  });
});

describe("anchored card positioning", () => {
  const viewport: Rect = { left: 0, top: 0, width: 390, height: 844, right: 390, bottom: 844 };
  const anchor: Rect = { left: 20, right: 100, top: 60, bottom: 88, width: 80, height: 28 };
  it("points to the speaker chevron while staying inside a narrow viewport", () => {
    const card = placeEducationTip(anchor, 320, 200, viewport, true)!;
    expect(card.left).toBe(16);
    expect(card.pointer + card.left).toBe(anchor.right - 6);
    expect(card.top).toBe(anchor.bottom + 12);
    expect(card.side).toBe("top");
    expect(card.left + card.width).toBeLessThanOrEqual(374);
  });
  it("flips above low anchors and never covers the target", () => {
    const low = { ...anchor, top: 700, bottom: 728 };
    const card = placeEducationTip(low, 320, 200, viewport)!;
    expect(card.side).toBe("bottom");
    expect(card.top + 200).toBeLessThan(low.top);
  });
  it("declines to show when neither side fits", () => {
    expect(placeEducationTip(anchor, 320, 800, viewport)).toBeNull();
  });
  it("honors a zoomed or keyboard-reduced visual viewport", () => {
    const view = { left: 50, top: 50, width: 280, height: 400, right: 330, bottom: 450 };
    const card = placeEducationTip({ ...anchor, left: 70, right: 150 }, 320, 160, view)!;
    expect(card.left).toBeGreaterThanOrEqual(66);
    expect(card.width).toBe(248);
    expect(card.left + card.width).toBeLessThanOrEqual(314);
  });
});
