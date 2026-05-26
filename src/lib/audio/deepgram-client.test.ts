import { describe, expect, it } from "vitest";
import { groupWordsBySpeaker } from "@/lib/audio/deepgram-client";

describe("groupWordsBySpeaker", () => {
  it("groups contiguous words by native speaker label", () => {
    const groups = groupWordsBySpeaker([
      { word: "hello", start: 0, end: 0.5, speaker: 0, confidence: 0.9 },
      { word: "there", start: 0.5, end: 1, speaker: 0, confidence: 0.9 },
      { word: "hi", start: 1, end: 1.5, speaker: 1, confidence: 0.9 },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.speaker).toBe(0);
    expect(groups[0]?.words).toHaveLength(2);
    expect(groups[1]?.speaker).toBe(1);
    expect(groups[1]?.words).toHaveLength(1);
  });

  it("defaults missing speaker labels to 0", () => {
    const groups = groupWordsBySpeaker([
      { word: "hello", start: 0, end: 0.5, confidence: 0.9 },
      { word: "world", start: 0.5, end: 1, speaker: 1, confidence: 0.9 },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.speaker).toBe(0);
    expect(groups[1]?.speaker).toBe(1);
  });

  it("returns empty array for no words", () => {
    expect(groupWordsBySpeaker([])).toEqual([]);
  });
});
