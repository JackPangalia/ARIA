import { describe, expect, it } from "vitest";
import {
  capSpeakerIdentifiers,
  MAX_STORED_SPEAKER_IDENTIFIERS,
  mergeLearnedSpeakerIdentifiers,
} from "./identifier-cap";

describe("speaker identifier limits", () => {
  it("deduplicates and caps explicit enrollment", () => {
    expect(capSpeakerIdentifiers(["a", "a", "b", "c", "d"])).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(MAX_STORED_SPEAKER_IDENTIFIERS).toBe(3);
  });

  it("appends session samples while room remains", () => {
    expect(mergeLearnedSpeakerIdentifiers(["enrolled"], ["room"])).toEqual([
      "enrolled",
      "room",
    ]);
  });

  it("preserves two established prints and rotates the latest room sample", () => {
    expect(
      mergeLearnedSpeakerIdentifiers(
        ["read", "conversation", "old-room"],
        ["new-room-1", "new-room-2"]
      )
    ).toEqual(["read", "conversation", "new-room-2"]);
  });

  it("does not change a profile for duplicate samples", () => {
    expect(
      mergeLearnedSpeakerIdentifiers(["read", "conversation"], ["read"])
    ).toEqual(["read", "conversation"]);
  });
});
