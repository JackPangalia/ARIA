import { describe, expect, it } from "vitest";
import {
  approach,
  glyphIgnition,
  letterRadialScale,
  trailOpacity,
} from "@/lib/voice/word-ring-motion";

describe("letterRadialScale", () => {
  it("stays on the circle when warp is off", () => {
    expect(letterRadialScale(0, 0, 1000, 1, 0.4, 0)).toBe(1);
  });

  it("stays on the circle when the voice is silent", () => {
    expect(letterRadialScale(1.2, 4, 800, 0, 0, 1)).toBe(1);
  });

  it("pushes letters off the circle when Kivo is loud", () => {
    const scale = letterRadialScale(0, 0, 0, 1, 0.5, 1);
    expect(scale).toBeGreaterThan(1.1);
    expect(scale).toBeLessThanOrEqual(1.34);
  });

  it("bends neighboring letters differently so the ring isn't rigid", () => {
    const a = letterRadialScale(0, 0, 1200, 0.8, 0.2, 1);
    const b = letterRadialScale(Math.PI / 2, 8, 1200, 0.8, 0.2, 1);
    expect(Math.abs(a - b)).toBeGreaterThan(0.02);
  });
});

describe("approach", () => {
  it("covers half the gap in one half-life", () => {
    expect(approach(0, 1, 100, 100)).toBeCloseTo(0.5, 6);
  });

  it("settles identically at 60Hz and 120Hz", () => {
    let slow = 0;
    let fast = 0;
    for (let i = 0; i < 30; i += 1) slow = approach(slow, 1, 90, 16.67);
    for (let i = 0; i < 60; i += 1) fast = approach(fast, 1, 90, 8.33);
    expect(Math.abs(slow - fast)).toBeLessThan(0.001);
  });

  it("holds still across a zero-length frame", () => {
    expect(approach(0.3, 1, 90, 0)).toBe(0.3);
  });

  it("jumps straight to target when there is no half-life", () => {
    expect(approach(0.3, 1, 0, 16)).toBe(1);
  });
});

describe("glyphIgnition", () => {
  it("is full on the frame a letter lands", () => {
    expect(glyphIgnition(0)).toBe(1);
  });

  it("decays to nothing by the end of the burn", () => {
    expect(glyphIgnition(420, 420)).toBe(0);
    expect(glyphIgnition(210, 420)).toBeCloseTo(0.25, 6);
  });

  it("ignores letters that arrived without a reveal", () => {
    expect(glyphIgnition(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("trailOpacity", () => {
  it("keeps the newest letter fully lit", () => {
    expect(trailOpacity(0, 26, 0.72)).toBe(1);
  });

  it("rests on the floor past the trail", () => {
    expect(trailOpacity(26, 26, 0.72)).toBe(0.72);
    expect(trailOpacity(400, 26, 0.72)).toBe(0.72);
  });

  it("fades without a kink where it meets the floor", () => {
    const near = trailOpacity(24, 26, 0.72);
    const at = trailOpacity(26, 26, 0.72);
    expect(near).toBeGreaterThan(at);
    expect(near - at).toBeLessThan(0.01);
  });
});
