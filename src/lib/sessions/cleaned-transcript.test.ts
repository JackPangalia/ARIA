import { describe, expect, it } from "vitest";
import {
  applyCleanedTranscript,
  validateCleanedTurns,
} from "@/lib/sessions/cleaned-transcript";
import type {
  CleanedTranscriptDoc,
  CleanedTranscriptTurn,
  TurnDoc,
} from "@/lib/sessions/types";

function turn(
  id: string,
  text: string,
  overrides: Partial<TurnDoc> = {}
): TurnDoc {
  return {
    id,
    role: "speaker",
    text,
    speaker: 0,
    speakerName: "Jack",
    sourceUtteranceIds: [],
    sequence: 1,
    tokenEstimate: 1,
    summarized: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function cleaned(turns: CleanedTranscriptTurn[]): CleanedTranscriptDoc {
  return {
    turns,
    generatedAt: new Date().toISOString(),
    turnCountAtGeneration: turns.length,
    model: "claude-haiku-4-5",
  };
}

describe("validateCleanedTurns", () => {
  it("accepts a merge of consecutive turns from one speaker", () => {
    const batch = [
      turn("a", "So."),
      turn("b", "Basic mode still uses model standard"),
      turn("c", "What's the difference?"),
    ];

    const result = validateCleanedTurns(batch, [
      {
        sourceIds: ["a", "b", "c"],
        text: "So, basic mode still uses model standard. What's the difference?",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].sourceTurnIds).toEqual(["a", "b", "c"]);
  });

  it("rejects a merge that spans two speakers", () => {
    const batch = [
      turn("a", "I think so"),
      turn("b", "no way", { speaker: 1, speakerName: "Sam" }),
    ];

    const result = validateCleanedTurns(batch, [
      { sourceIds: ["a", "b"], text: "I think so, no way." },
    ]);

    // Both turns survive separately rather than being fused into one speaker.
    expect(result.map((entry) => entry.sourceTurnIds)).toEqual([["a"], ["b"]]);
  });

  it("drops short filler the model left out", () => {
    const batch = [turn("a", "Hello?"), turn("b", "What do you think?")];

    const result = validateCleanedTurns(batch, [
      { sourceIds: ["b"], text: "What do you think?" },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].sourceTurnIds).toEqual(["b"]);
  });

  it("puts back a substantial turn the model left out", () => {
    const long = "I really think we should ship this thing before the weekend.";
    const batch = [turn("a", long), turn("b", "Sure.")];

    const result = validateCleanedTurns(batch, [
      { sourceIds: ["b"], text: "Sure." },
    ]);

    expect(result.map((entry) => entry.text)).toContain(long);
  });

  it("ignores entries citing ids that were never in the batch", () => {
    const batch = [turn("a", "real turn")];

    const result = validateCleanedTurns(batch, [
      { sourceIds: ["ghost"], text: "invented" },
      { sourceIds: ["a"], text: "Real turn." },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Real turn.");
  });

  it("refuses to use the same source turn twice", () => {
    const batch = [turn("a", "once")];

    const result = validateCleanedTurns(batch, [
      { sourceIds: ["a"], text: "Once." },
      { sourceIds: ["a"], text: "Once again." },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Once.");
  });
});

describe("validateCleanedTurns contiguity", () => {
  it("rejects a merge that jumps over an answer between two questions", () => {
    const q1 = turn("q1", "What do you think about Cursor?");
    const answer = turn("a1", "Cursor's the best...", {
      role: "assistant",
      speakerName: null,
    });
    const q2 = turn("q2", "What about Claude Code?");
    const position = new Map([q1, answer, q2].map((t, i) => [t.id, i]));

    const result = validateCleanedTurns(
      [q1, q2],
      [
        {
          sourceIds: ["q1", "q2"],
          text: "What do you think about Cursor? What about Claude Code?",
        },
      ],
      position
    );

    // Both questions survive on their own, so Kivo's answer still has
    // something to answer.
    expect(result.map((entry) => entry.sourceTurnIds)).toEqual([["q1"], ["q2"]]);
  });

  it("still merges turns that really are adjacent", () => {
    const a = turn("a", "So.");
    const b = turn("b", "what's the difference?");
    const position = new Map([a, b].map((t, i) => [t.id, i]));

    const result = validateCleanedTurns(
      [a, b],
      [{ sourceIds: ["a", "b"], text: "So, what's the difference?" }],
      position
    );

    expect(result).toHaveLength(1);
    expect(result[0].sourceTurnIds).toEqual(["a", "b"]);
  });
});

describe("applyCleanedTranscript", () => {
  it("collapses merged turns into a single readable turn", () => {
    const turns = [turn("a", "So."), turn("b", "what's the difference?")];
    const result = applyCleanedTranscript(
      turns,
      cleaned([{ sourceTurnIds: ["a", "b"], text: "So, what's the difference?" }])
    );

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("So, what's the difference?");
    expect(result[0].sourceTurnIds).toEqual(["a", "b"]);
  });

  it("keeps every source id so a speaker correction reaches all of them", () => {
    const result = applyCleanedTranscript(
      [turn("a", "one"), turn("b", "two"), turn("c", "three")],
      cleaned([{ sourceTurnIds: ["a", "b", "c"], text: "One two three." }])
    );

    expect(result[0].sourceTurnIds).toEqual(["a", "b", "c"]);
    expect(result[0].speakerName).toBe("Jack");
  });

  it("passes assistant turns through untouched", () => {
    const turns = [
      turn("a", "raw question"),
      turn("k", "Kivo's answer", { role: "assistant", speakerName: null }),
    ];

    const result = applyCleanedTranscript(
      turns,
      cleaned([{ sourceTurnIds: ["a"], text: "Raw question?" }])
    );

    expect(result.map((t) => t.text)).toEqual([
      "Raw question?",
      "Kivo's answer",
    ]);
  });

  it("falls back to the raw transcript when there is no cleaned doc", () => {
    const turns = [turn("a", "raw one"), turn("b", "raw two")];

    expect(applyCleanedTranscript(turns, null).map((t) => t.text)).toEqual([
      "raw one",
      "raw two",
    ]);
    expect(applyCleanedTranscript(turns, cleaned([])).map((t) => t.text)).toEqual(
      ["raw one", "raw two"]
    );
  });

  it("preserves raw ordering", () => {
    const turns = [turn("a", "one"), turn("b", "two"), turn("c", "three")];
    const result = applyCleanedTranscript(
      turns,
      cleaned([
        { sourceTurnIds: ["c"], text: "Three." },
        { sourceTurnIds: ["a"], text: "One." },
        { sourceTurnIds: ["b"], text: "Two." },
      ])
    );

    expect(result.map((t) => t.text)).toEqual(["One.", "Two.", "Three."]);
  });
});
