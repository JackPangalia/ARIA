import { describe, expect, it } from "vitest";
import {
  maxSpeakersForProfiles,
  preferCurrentSpeakerForProfiles,
  speakerSensitivityForProfiles,
} from "@/lib/speakers/diarization-config";

describe("preferCurrentSpeakerForProfiles", () => {
  it("always enables stickiness for speaker consistency", () => {
    expect(preferCurrentSpeakerForProfiles(0)).toBe(true);
    expect(preferCurrentSpeakerForProfiles(1)).toBe(true);
    expect(preferCurrentSpeakerForProfiles(2)).toBe(true);
    expect(preferCurrentSpeakerForProfiles(5)).toBe(true);
  });
});

describe("speakerSensitivityForProfiles", () => {
  it("leaves Speechmatics sensitivity at its default without enrolled profiles", () => {
    expect(speakerSensitivityForProfiles(0)).toBeUndefined();
  });

  it("keeps a mild bias toward enrolled speakers when profiles exist", () => {
    // 0.4, not lower: an unsure match must fall out as a generic speaker
    // (recoverable) rather than being rounded into an enrolled label, which
    // the provider's online clustering then locks in for the whole stream.
    expect(speakerSensitivityForProfiles(1)).toBe(0.4);
    expect(speakerSensitivityForProfiles(2)).toBe(0.4);
  });
});

describe("maxSpeakersForProfiles", () => {
  it("keeps broad diarization when no profiles are enrolled", () => {
    expect(maxSpeakersForProfiles(0)).toBe(10);
  });

  it("leaves headroom for guests and Kivo's own TTS cluster", () => {
    expect(maxSpeakersForProfiles(1)).toBe(4);
    expect(maxSpeakersForProfiles(2)).toBe(5);
    expect(maxSpeakersForProfiles(7)).toBe(10);
    expect(maxSpeakersForProfiles(12)).toBe(10);
  });
});
