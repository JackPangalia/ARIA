import { describe, expect, it } from "vitest";
import {
  AUTO_LEARN_MIN_SPEECH_MS,
  selectReinforcementCandidates,
} from "./reinforcement";

function cluster(label: string, identifiers: string[]) {
  return {
    clusterKey: `1:${label}`,
    streamEpoch: 1,
    providerSpeakerLabel: label,
    speakerIdentifiers: identifiers,
  };
}

const baseInput = {
  clusters: [cluster("Diego", ["old", "fresh"])],
  attributedMsByLabel: new Map([["Diego", AUTO_LEARN_MIN_SPEECH_MS]]),
  profilesByLabel: new Map([["Diego", { id: "diego", name: "Diego" }]]),
  correctedLabels: new Set<string>(),
  alreadyReinforced: new Set<string>(),
};

describe("selectReinforcementCandidates", () => {
  it("reinforces a profile that carried sustained uncorrected speech", () => {
    expect(selectReinforcementCandidates(baseInput)).toEqual([
      {
        providerSpeakerLabel: "Diego",
        profileId: "diego",
        profileName: "Diego",
        identifier: "fresh",
      },
    ]);
  });

  it("waits until the speech threshold is met", () => {
    expect(
      selectReinforcementCandidates({
        ...baseInput,
        attributedMsByLabel: new Map([["Diego", AUTO_LEARN_MIN_SPEECH_MS - 1]]),
      })
    ).toEqual([]);
  });

  it("never learns from a cluster the user corrected", () => {
    expect(
      selectReinforcementCandidates({
        ...baseInput,
        correctedLabels: new Set(["Diego"]),
      })
    ).toEqual([]);
  });

  it("learns at most one sample per profile per session", () => {
    expect(
      selectReinforcementCandidates({
        ...baseInput,
        alreadyReinforced: new Set(["diego"]),
      })
    ).toEqual([]);
  });

  it("ignores generic clusters that matched no enrolled profile", () => {
    expect(
      selectReinforcementCandidates({
        ...baseInput,
        clusters: [cluster("S2", ["print"])],
        attributedMsByLabel: new Map([["S2", AUTO_LEARN_MIN_SPEECH_MS * 10]]),
      })
    ).toEqual([]);
  });

  it("ignores a qualifying cluster that produced no voiceprint", () => {
    expect(
      selectReinforcementCandidates({ ...baseInput, clusters: [cluster("Diego", [])] })
    ).toEqual([]);
  });

  it("does not reinforce one profile twice from two of its clusters", () => {
    expect(
      selectReinforcementCandidates({
        ...baseInput,
        clusters: [cluster("Diego", ["a"]), cluster("Diego", ["b"])],
      })
    ).toHaveLength(1);
  });
});
