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

  it("biases matching toward enrolled speakers when profiles exist", () => {
    expect(speakerSensitivityForProfiles(1)).toBe(0.2);
    expect(speakerSensitivityForProfiles(2)).toBe(0.2);
  });
});

describe("maxSpeakersForProfiles", () => {
  it("keeps broad diarization when no profiles are enrolled", () => {
    expect(maxSpeakersForProfiles(0)).toBe(10);
  });

  it("allows enrolled speakers plus one unregistered speaker", () => {
    expect(maxSpeakersForProfiles(1)).toBe(2);
    expect(maxSpeakersForProfiles(2)).toBe(3);
    expect(maxSpeakersForProfiles(9)).toBe(10);
    expect(maxSpeakersForProfiles(12)).toBe(10);
  });
});
