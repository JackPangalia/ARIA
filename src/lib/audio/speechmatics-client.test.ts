import { describe, expect, it } from "vitest";
import { groupSpeechmaticsResultsBySpeaker } from "@/lib/audio/speechmatics-client";

describe("groupSpeechmaticsResultsBySpeaker", () => {
  it("groups contiguous words by Speechmatics speaker labels", () => {
    const groups = groupSpeechmaticsResultsBySpeaker([
      {
        type: "word",
        start_time: 0,
        end_time: 0.4,
        alternatives: [{ content: "Hello", confidence: 0.9, speaker: "S1" }],
      },
      {
        type: "word",
        start_time: 0.4,
        end_time: 0.8,
        alternatives: [{ content: "there", confidence: 0.8, speaker: "S1" }],
      },
      {
        type: "word",
        start_time: 1,
        end_time: 1.4,
        alternatives: [{ content: "Hi", confidence: 0.95, speaker: "Alice" }],
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      providerSpeakerLabel: "S1",
      text: "Hello there",
      start: 0,
      end: 0.8,
    });
    expect(groups[1]).toMatchObject({
      providerSpeakerLabel: "Alice",
      text: "Hi",
      start: 1,
      end: 1.4,
    });
  });

  it("attaches punctuation to the previous speaker run", () => {
    const groups = groupSpeechmaticsResultsBySpeaker([
      {
        type: "word",
        start_time: 0,
        end_time: 0.4,
        alternatives: [{ content: "Hello", confidence: 0.9, speaker: "S1" }],
      },
      {
        type: "punctuation",
        start_time: 0.4,
        end_time: 0.4,
        alternatives: [{ content: ",", confidence: 1 }],
      },
      {
        type: "word",
        start_time: 0.5,
        end_time: 0.9,
        alternatives: [{ content: "ARIA", confidence: 0.9, speaker: "S1" }],
      },
      {
        type: "punctuation",
        start_time: 0.9,
        end_time: 0.9,
        alternatives: [{ content: "?", confidence: 1 }],
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.text).toBe("Hello, ARIA?");
  });
});
