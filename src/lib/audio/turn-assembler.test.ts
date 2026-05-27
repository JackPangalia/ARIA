import { describe, expect, it } from "vitest";
import { TranscriptTurnAssembler } from "@/lib/audio/turn-assembler";
import type { TranscriptUtterance } from "@/lib/types";

function utterance(
  patch: Partial<TranscriptUtterance> & Pick<TranscriptUtterance, "id" | "text">
): TranscriptUtterance {
  return {
    speaker: 0,
    start: 0,
    end: 1,
    isFinal: true,
    speechFinal: true,
    ...patch,
  };
}

describe("TranscriptTurnAssembler", () => {
  it("combines contiguous final chunks from the same speaker", () => {
    const assembler = new TranscriptTurnAssembler();

    expect(
      assembler.append(utterance({ id: "a", text: "Can we review", end: 1 }))
    ).toBeNull();
    expect(
      assembler.append(
        utterance({ id: "b", text: "the migration plan?", start: 1.2, end: 2 })
      )
    ).toBeNull();

    const flushed = assembler.flush();
    expect(flushed?.utterance.text).toBe("Can we review the migration plan?");
    expect(flushed?.sourceUtteranceIds).toEqual(["a", "b"]);
  });

  it("flushes when the speaker changes", () => {
    const assembler = new TranscriptTurnAssembler();

    assembler.append(
      utterance({
        id: "a",
        text: "First speaker.",
        providerSpeakerLabel: "S1",
      })
    );
    const flushed = assembler.append(
      utterance({
        id: "b",
        text: "Second speaker.",
        speaker: 1,
        providerSpeakerLabel: "S2",
      })
    );

    expect(flushed?.utterance.text).toBe("First speaker.");
    expect(assembler.flush()?.utterance.text).toBe("Second speaker.");
  });

  it("flushes when the same speaker has a long gap", () => {
    const assembler = new TranscriptTurnAssembler();

    assembler.append(utterance({ id: "a", text: "Earlier.", end: 1 }));
    const flushed = assembler.append(
      utterance({ id: "b", text: "Much later.", start: 8, end: 9 })
    );

    expect(flushed?.utterance.text).toBe("Earlier.");
    expect(assembler.flush()?.utterance.text).toBe("Much later.");
  });
});
