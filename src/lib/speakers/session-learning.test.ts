import { describe, expect, it } from "vitest";
import {
  mergeSessionSpeakerClusters,
  speakerClusterKeyForTurn,
  streamEpochFromUtteranceId,
} from "./session-learning";

describe("session speaker learning", () => {
  it("derives stream epochs from namespaced utterance ids", () => {
    expect(streamEpochFromUtteranceId("0.5-0")).toBe(1);
    expect(streamEpochFromUtteranceId("3:0.5-0")).toBe(3);
  });

  it("keeps reused provider labels separate across reconnects", () => {
    expect(
      speakerClusterKeyForTurn({
        providerSpeakerLabel: "S1",
        sourceUtteranceIds: ["0.5-0"],
      })
    ).toBe("1:S1");
    expect(
      speakerClusterKeyForTurn({
        providerSpeakerLabel: "S1",
        sourceUtteranceIds: ["2:0.5-0"],
      })
    ).toBe("2:S1");
  });

  it("merges snapshots only within the same stream-scoped cluster", () => {
    expect(
      mergeSessionSpeakerClusters(
        [
          {
            clusterKey: "1:S1",
            streamEpoch: 1,
            providerSpeakerLabel: "S1",
            speakerIdentifiers: ["a"],
          },
        ],
        [
          {
            clusterKey: "1:S1",
            streamEpoch: 1,
            providerSpeakerLabel: "S1",
            speakerIdentifiers: ["a", "b"],
          },
          {
            clusterKey: "2:S1",
            streamEpoch: 2,
            providerSpeakerLabel: "S1",
            speakerIdentifiers: ["c"],
          },
        ]
      )
    ).toEqual([
      {
        clusterKey: "1:S1",
        streamEpoch: 1,
        providerSpeakerLabel: "S1",
        speakerIdentifiers: ["a", "b"],
      },
      {
        clusterKey: "2:S1",
        streamEpoch: 2,
        providerSpeakerLabel: "S1",
        speakerIdentifiers: ["c"],
      },
    ]);
  });
});
