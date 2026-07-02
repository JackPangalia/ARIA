import { describe, expect, it } from "vitest";
import { shouldApplyStripeEvent } from "@/lib/plan/repository";

describe("shouldApplyStripeEvent", () => {
  it("applies when no prior event has been recorded", () => {
    expect(shouldApplyStripeEvent(null, 100)).toBe(true);
    expect(shouldApplyStripeEvent(undefined, 100)).toBe(true);
  });

  it("applies newer and equal events", () => {
    expect(shouldApplyStripeEvent(100, 101)).toBe(true);
    expect(shouldApplyStripeEvent(100, 100)).toBe(true);
  });

  it("rejects stale events so an out-of-order delivery cannot regress the plan", () => {
    expect(shouldApplyStripeEvent(101, 100)).toBe(false);
  });

  it("applies when the incoming event has no ordering info", () => {
    expect(shouldApplyStripeEvent(100, null)).toBe(true);
    expect(shouldApplyStripeEvent(100, undefined)).toBe(true);
  });
});
