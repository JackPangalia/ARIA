import { describe, expect, it } from "vitest";
import {
  maxSpeakersForProfiles,
  preferCurrentSpeakerForProfiles,
  speakerSensitivityForProfiles,
} from "@/lib/speakers/diarization-config";

describe("preferCurrentSpeakerForProfiles", () => {
  it("always enables stickiness for speaker consistency", () => {
    expect(preferCurrentSpeakerForProfiles()).toBe(true);
  });
});

describe("speakerSensitivityForProfiles", () => {
  it("leaves Speechmatics sensitivity at its default without enrolled profiles", () => {
    expect(speakerSensitivityForProfiles([])).toBeUndefined();
  });

  it("stays permissive while any profile is still thin", () => {
    // 0.4, not lower: an unsure match must fall out as a generic speaker
    // (recoverable) rather than being rounded into an enrolled label, which
    // the provider's online clustering then locks in for the whole stream.
    expect(speakerSensitivityForProfiles([1])).toBe(0.4);
    expect(speakerSensitivityForProfiles([8, 8, 2])).toBe(0.4);
  });

  it("tightens to the vendor default once every profile is well sampled", () => {
    // A rich profile matches on its own merits, so the permissive threshold
    // stops earning its false-accept cost.
    expect(speakerSensitivityForProfiles([4, 6, 8])).toBe(0.5);
  });
});

describe("maxSpeakersForProfiles", () => {
  it("keeps broad diarization when no profiles are enrolled", () => {
    expect(maxSpeakersForProfiles(0)).toBe(10);
  });

  it("allows a flat guest allowance, since enrolled labels are exempt", () => {
    // max_speakers governs generic speakers only — enrolled labels do not
    // consume it — so this must not scale with the enrolled profile count.
    expect(maxSpeakersForProfiles(1)).toBe(6);
    expect(maxSpeakersForProfiles(12)).toBe(6);
  });
});
