import { describe, expect, it } from "vitest";
import {
  capSpeakerIdentifiers,
  MAX_ANCHOR_IDENTIFIERS,
  MAX_LEARN_SPEAKER_IDENTIFIERS,
  MAX_STORED_SPEAKER_IDENTIFIERS,
  mergeLearnedSpeakerIdentifiers,
  recentClusterIdentifiers,
  resolveAnchorCount,
} from "./identifier-cap";
import { LearnSpeakerProfileSchema } from "./types";

describe("speaker identifier limits", () => {
  it("caps explicit enrollment at the anchor budget", () => {
    expect(capSpeakerIdentifiers(["a", "a", "b", "c", "d"])).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(MAX_ANCHOR_IDENTIFIERS).toBe(3);
  });

  it("appends session samples while room remains", () => {
    expect(mergeLearnedSpeakerIdentifiers(["enrolled"], ["room"], 1)).toEqual({
      identifiers: ["enrolled", "room"],
      anchorCount: 1,
    });
  });

  it("accumulates acoustic spread up to the storage cap", () => {
    const samples = Array.from({ length: 10 }, (_, i) => `room-${i}`);
    const merged = mergeLearnedSpeakerIdentifiers(
      ["read", "conversation"],
      samples,
      2
    );
    expect(merged.identifiers).toHaveLength(MAX_STORED_SPEAKER_IDENTIFIERS);
    expect(merged.anchorCount).toBe(2);
  });

  it("never evicts enrollment anchors, only the oldest room samples", () => {
    const full = [
      "read",
      "conversation",
      "old-room",
      "room-1",
      "room-2",
      "room-3",
      "room-4",
      "room-5",
    ];
    const merged = mergeLearnedSpeakerIdentifiers(full, ["fresh"], 2);
    expect(merged.identifiers.slice(0, 2)).toEqual(["read", "conversation"]);
    expect(merged.identifiers).toHaveLength(MAX_STORED_SPEAKER_IDENTIFIERS);
    expect(merged.identifiers).not.toContain("old-room");
    expect(merged.identifiers.at(-1)).toBe("fresh");
  });

  it("does not change a profile for duplicate samples", () => {
    expect(
      mergeLearnedSpeakerIdentifiers(["read", "conversation"], ["read"], 2)
    ).toEqual({ identifiers: ["read", "conversation"], anchorCount: 2 });
  });

  it("anchors the first prints of a profile born from a transcript tag", () => {
    const merged = mergeLearnedSpeakerIdentifiers([], ["a", "b", "c", "d"]);
    expect(merged.identifiers).toEqual(["a", "b", "c", "d"]);
    expect(merged.anchorCount).toBe(MAX_ANCHOR_IDENTIFIERS);
  });

  it("treats leading prints of a pre-anchor profile as anchors", () => {
    expect(resolveAnchorCount(["a", "b", "c", "d"], null)).toBe(
      MAX_ANCHOR_IDENTIFIERS
    );
    expect(resolveAnchorCount(["a"], null)).toBe(1);
    expect(resolveAnchorCount(["a", "b"], 5)).toBe(2);
  });
});

describe("learn payload cap", () => {
  it("accepts a live cluster larger than the storage cap", () => {
    // Regression: the learn schema used to validate against the storage cap,
    // so any correction after ~90s of audio failed with "invalid payload".
    const cluster = Array.from({ length: 12 }, (_, i) => `print-${i}`);
    const parsed = LearnSpeakerProfileSchema.safeParse({
      name: "Diego",
      speakerIdentifiers: recentClusterIdentifiers(cluster),
    });
    expect(parsed.success).toBe(true);
  });

  it("keeps the newest identifiers and drops duplicates", () => {
    const cluster = [
      ...Array.from({ length: MAX_LEARN_SPEAKER_IDENTIFIERS + 5 }, (_, i) => `p${i}`),
      "p0",
    ];
    const trimmed = recentClusterIdentifiers(cluster);
    expect(trimmed).toHaveLength(MAX_LEARN_SPEAKER_IDENTIFIERS);
    expect(trimmed.at(-1)).toBe(`p${MAX_LEARN_SPEAKER_IDENTIFIERS + 4}`);
  });
});
