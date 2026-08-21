import { describe, expect, it } from "vitest";
import type { TranscriptUtterance } from "@/lib/types";
import {
  RING_WORD_GAP,
  fitRingText,
  makeFillerPool,
  ringContentFor,
  ringStep,
  ringTextFromUtterances,
  scrambleFiller,
} from "@/lib/voice/word-ring-text";

function utterance(
  patch: Partial<TranscriptUtterance> & Pick<TranscriptUtterance, "id" | "text">,
): TranscriptUtterance {
  return {
    speaker: 0,
    speakerName: "Maya",
    providerSpeakerLabel: "s1",
    start: 0,
    end: 0.5,
    isFinal: true,
    speechFinal: true,
    ...patch,
  };
}

describe("ringTextFromUtterances", () => {
  it("joins same-speaker fragments and dots speaker changes", () => {
    const text = ringTextFromUtterances([
      utterance({ id: "a", text: "We'll ship", start: 0, end: 0.4 }),
      utterance({ id: "b", text: "Friday.", start: 0.5, end: 0.9 }),
      utterance({
        id: "c",
        text: "I'll take the follow-up.",
        start: 1,
        end: 1.6,
        speaker: 1,
        speakerName: "James",
        providerSpeakerLabel: "s2",
      }),
    ]);

    expect(text).toBe(`We'll ship Friday.${RING_WORD_GAP}I'll take the follow-up.`);
  });

  it("drops Kivo's own echo", () => {
    const text = ringTextFromUtterances([
      utterance({ id: "echo", text: "Friday works.", overlapsAssistantSpeech: true }),
      utterance({ id: "human", text: "Ship it." }),
    ]);
    expect(text).toBe("Ship it.");
  });
});

describe("fitRingText", () => {
  const widthOf = () => 1;

  it("returns the newest suffix that fits", () => {
    expect(fitRingText("alpha beta gamma delta", 11, widthOf)).toBe("gamma delta");
  });

  it("keeps a partial oldest word so the ring can pack full", () => {
    expect(fitRingText("shipping Friday works", 10, widthOf)).toBe("iday works");
  });

  it("keeps the whole line when it already fits", () => {
    expect(fitRingText("  ship  it ", 40, widthOf)).toBe("ship it");
  });

  it("drops everything when not even one glyph fits", () => {
    expect(fitRingText("ship", 0.5, widthOf)).toBe("");
  });

  it("packs by measured width, not by character count", () => {
    const wide = (ch: string) => (ch === "W" ? 4 : 1);
    expect(fitRingText("WWab", 6, wide)).toBe("Wab");
  });
});

describe("makeFillerPool", () => {
  it("walks the whole alphabet instead of collapsing to a couple of letters", () => {
    const pool = makeFillerPool(120);
    const letters = new Set(pool.replace(/·/g, "").split(""));
    expect(letters.size).toBeGreaterThan(20);
  });

  it("breaks the cipher up without landing the middots on a beat", () => {
    const gaps = makeFillerPool(400)
      .split("·")
      .slice(1, -1)
      .map((run) => run.length);
    expect(gaps.length).toBeGreaterThan(20);
    expect(new Set(gaps).size).toBeGreaterThan(3);
  });
});

describe("scrambleFiller", () => {
  it("replaces a letter without touching middots", () => {
    expect(scrambleFiller("ab·c", 0, 2)).toBe("cb·c");
    expect(scrambleFiller("ab·c", 2, 4)).toBe("ab·c");
  });
});

describe("ringStep", () => {
  it("types a growing suffix", () => {
    expect(ringStep("what did", "what did we decide", "what did we decide")).toEqual({
      kind: "type",
      text: " we decide",
    });
  });

  it("stays put when the ring already holds the newest clipped suffix", () => {
    expect(
      ringStep("delta epsilon", "alpha beta gamma delta epsilon", "delta epsilon"),
    ).toEqual({ kind: "done" });
  });

  it("types only the new tail after the ring has already clipped oldest letters", () => {
    expect(
      ringStep(
        "delta epsilon",
        "alpha beta gamma delta epsilon zeta",
        "epsilon zeta",
      ),
    ).toEqual({ kind: "type", text: " zeta" });
  });

  it("snaps when the transcript is rewritten", () => {
    expect(ringStep("what did we", "what did you", "what did you")).toEqual({
      kind: "snap",
      text: "what did you",
    });
  });
});

describe("ringContentFor", () => {
  it("rests on an empty live string so the cipher can complete the ring", () => {
    expect(ringContentFor("idle", "")).toEqual({
      text: "",
      voice: "sans",
    });
  });

  it("sets live room speech in sans around the ring", () => {
    expect(ringContentFor("listen", "We'll ship Friday.")).toEqual({
      text: "We'll ship Friday.",
      voice: "sans",
    });
  });

  it("sets a captured question in serif", () => {
    expect(ringContentFor("wake", "What's the timeline?")).toEqual({
      text: "What's the timeline?",
      voice: "serif",
    });
  });
});
