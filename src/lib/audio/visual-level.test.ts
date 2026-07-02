import { describe, expect, it } from "vitest";
import { VisualMicLevelNormalizer } from "@/lib/audio/visual-level";

function settle(
  normalizer: VisualMicLevelNormalizer,
  level: number,
  frames = 30
): number {
  let output = 0;
  for (let i = 0; i < frames; i++) output = normalizer.update(level);
  return output;
}

describe("VisualMicLevelNormalizer", () => {
  it("keeps quiet room noise visually still", () => {
    const normalizer = new VisualMicLevelNormalizer();
    const output = settle(normalizer, 0.0015, 40);

    expect(output).toBeLessThan(0.05);
  });

  it("amplifies low raw speaker-ID capture into visible orb energy", () => {
    const normalizer = new VisualMicLevelNormalizer();
    settle(normalizer, 0.0015, 20);
    const output = settle(normalizer, 0.008, 20);

    expect(output).toBeGreaterThan(0.25);
  });

  it("adapts down after louder browser-processed input", () => {
    const normalizer = new VisualMicLevelNormalizer();
    const loud = settle(normalizer, 0.08, 20);
    const quiet = settle(normalizer, 0.0015, 60);

    expect(loud).toBeGreaterThan(0.5);
    expect(quiet).toBeLessThan(0.1);
  });

  it("reset clears learned output", () => {
    const normalizer = new VisualMicLevelNormalizer();
    settle(normalizer, 0.04, 20);
    normalizer.reset();

    expect(normalizer.update(0)).toBe(0);
  });
});
