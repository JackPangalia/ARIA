import { describe, expect, it } from "vitest";
import { buildLiveTranscriptLines } from "@/lib/sessions/live-transcript";
import type { TurnDoc } from "@/lib/sessions/types";
import type { TranscriptUtterance } from "@/lib/types";

function turn(patch: Partial<TurnDoc> & Pick<TurnDoc, "id" | "text">): TurnDoc {
  return {
    role: "speaker",
    speaker: null,
    speakerName: null,
    sourceUtteranceIds: [],
    sequence: 1,
    tokenEstimate: 1,
    summarized: false,
    createdAt: "2026-06-30T00:00:00.000Z",
    ...patch,
  };
}

function utterance(
  patch: Partial<TranscriptUtterance> & Pick<TranscriptUtterance, "id" | "text">
): TranscriptUtterance {
  return {
    speaker: 0,
    speakerName: "Conversation",
    providerSpeakerLabel: "conversation",
    start: 0,
    end: 0.5,
    isFinal: false,
    speechFinal: false,
    ...patch,
  };
}

describe("buildLiveTranscriptLines", () => {
  it("appends an unpersisted partial as a live tail", () => {
    const lines = buildLiveTranscriptLines({
      turns: [turn({ id: "t1", text: "Already saved." })],
      utterances: [utterance({ id: "u1", text: "currently speaking" })],
    });

    expect(lines).toMatchObject([
      { id: "t1", text: "Already saved.", isPartial: false },
      {
        id: "live:u1",
        text: "currently speaking",
        speakerName: "Conversation",
        isPartial: true,
      },
    ]);
  });

  it("drops live utterances that are already covered by persisted turns", () => {
    const lines = buildLiveTranscriptLines({
      turns: [
        turn({
          id: "t1",
          text: "Persisted final.",
          sourceUtteranceIds: ["u1"],
        }),
      ],
      utterances: [
        utterance({
          id: "u1",
          text: "Persisted final.",
          isFinal: true,
          speechFinal: true,
        }),
      ],
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      id: "t1",
      text: "Persisted final.",
      isPartial: false,
    });
  });

  it("suppresses raw wake-word utterances once the user_question turn carries their ids", () => {
    const lines = buildLiveTranscriptLines({
      turns: [
        turn({
          id: "q1",
          role: "user_question",
          text: "Do you think I should launch in beta?",
          sourceUtteranceIds: ["u1", "u2"],
        }),
      ],
      // The raw spoken utterances still linger in the live store (wake word +
      // trailing filler), keyed by the ids now recorded on the persisted turn.
      utterances: [
        utterance({
          id: "u1",
          text: "Kivo. Do you think I should launch in beta?",
          isFinal: true,
          speechFinal: true,
        }),
        utterance({ id: "u2", text: "and", start: 0.8, end: 1.1, isFinal: true }),
      ],
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      id: "q1",
      role: "user_question",
      text: "Do you think I should launch in beta?",
      isPartial: false,
    });
  });

  it("merges contiguous live utterances from the same speaker", () => {
    const lines = buildLiveTranscriptLines({
      turns: [],
      utterances: [
        utterance({
          id: "u1",
          text: "first",
          start: 0,
          end: 0.5,
          isFinal: true,
        }),
        utterance({
          id: "u2",
          text: "second",
          start: 0.8,
          end: 1.2,
        }),
      ],
    });

    expect(lines).toEqual([
      {
        id: "live:u1+u2",
        role: "speaker",
        text: "first second",
        speaker: 0,
        speakerName: "Conversation",
        providerSpeakerLabel: "conversation",
        speakerClusterKey: "1:conversation",
        sourceUtteranceIds: ["u1", "u2"],
        isPartial: true,
      },
    ]);
  });

  it("does not merge a reused provider label across reconnect streams", () => {
    const lines = buildLiveTranscriptLines({
      turns: [],
      utterances: [
        utterance({
          id: "u1",
          providerSpeakerLabel: "S1",
          text: "before reconnect",
          isFinal: true,
        }),
        utterance({
          id: "2:0.1-0",
          providerSpeakerLabel: "S1",
          text: "after reconnect",
          start: 0.1,
          end: 0.5,
          isFinal: true,
        }),
      ],
    });

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.speakerClusterKey)).toEqual([
      "1:S1",
      "2:S1",
    ]);
  });
});

describe("correction handles on question turns", () => {
  it("gives a spoken question the same cluster key as the asker's other speech", () => {
    // Regression: questions are persisted by the ask pipeline, not the
    // transcript path. Without a providerSpeakerLabel they carried no cluster
    // key, so they were the one kind of line that could never be corrected —
    // visibly, a transcript where some lines had the speaker menu and some
    // didn't.
    const lines = buildLiveTranscriptLines({
      turns: [
        turn({
          id: "t1",
          text: "That's some bullshit.",
          role: "speaker",
          speakerName: "jack",
          providerSpeakerLabel: "jack",
          sourceUtteranceIds: ["12.4"],
        }),
        turn({
          id: "t2",
          text: "What have we been talking about?",
          role: "user_question",
          speakerName: "jack",
          providerSpeakerLabel: "jack",
          sourceUtteranceIds: ["18.1"],
        }),
      ],
      utterances: [],
    });

    expect(lines[0]!.speakerClusterKey).toBe("1:jack");
    expect(lines[1]!.speakerClusterKey).toBe("1:jack");
  });

  it("leaves a typed chat question uncorrectable", () => {
    // No microphone, no diarization label, nothing to learn a voice from.
    const lines = buildLiveTranscriptLines({
      turns: [
        turn({
          id: "t1",
          text: "typed in the chat dock",
          role: "user_question",
          sourceUtteranceIds: [],
        }),
      ],
      utterances: [],
    });

    expect(lines[0]!.speakerClusterKey).toBeNull();
  });
});
