import { describe, expect, it } from "vitest";
import { buildHistoryTurns } from "@/lib/aria/context/build-context";
import { extractSearchTerms } from "@/lib/aria/context/question-text";
import type { TurnDoc, TurnRole } from "@/lib/sessions/types";

let sequence = 0;

function turn(
  role: TurnRole,
  text: string,
  patch: Partial<TurnDoc> = {}
): TurnDoc {
  sequence += 1;
  return {
    id: `turn-${sequence}`,
    role,
    text,
    speaker: null,
    speakerName: null,
    sourceUtteranceIds: [],
    sequence,
    tokenEstimate: Math.ceil(text.length / 4),
    summarized: false,
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

/**
 * Room speech used to be stripped out of the ordered history and pasted into a
 * trailing blob labeled "not what you are being asked about". Anything Kivo
 * heard but did not answer was effectively invisible, and nothing carried its
 * position in time — so "what did I just say" reached back into the middle of
 * the session instead of the line before it.
 */
describe("buildHistoryTurns", () => {
  it("keeps room speech in place instead of dropping it", () => {
    const history = buildHistoryTurns([
      turn("user_question", "who technically is the best singer"),
      turn("assistant", "It depends what you're measuring."),
      turn("speaker", "I mean, yeah, I guess that's valid."),
      turn("user_question", "what did I just say"),
    ]);

    expect(history).toEqual([
      { role: "user", text: "who technically is the best singer" },
      { role: "assistant", text: "It depends what you're measuring." },
      {
        role: "user",
        text: "I mean, yeah, I guess that's valid.\nwhat did I just say",
      },
    ]);
  });

  it("folds a run of human turns into one user message", () => {
    const history = buildHistoryTurns([
      turn("speaker", "one"),
      turn("speaker", "two"),
      turn("user_question", "three"),
      turn("assistant", "answer"),
      turn("speaker", "four"),
    ]);

    expect(history.map((item) => item.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(history[0].text).toBe("one\ntwo\nthree");
    expect(history[2].text).toBe("four");
  });

  it("keeps names on the lines so a room stays attributable", () => {
    const history = buildHistoryTurns([
      turn("speaker", "ship it Friday", { speakerName: "Ari" }),
      turn("user_question", "what do you think", { speakerName: "Jack" }),
    ]);

    expect(history).toEqual([
      { role: "user", text: "Ari: ship it Friday\nJack: what do you think" },
    ]);
  });

  it("marks where an answer was cut off", () => {
    const history = buildHistoryTurns([
      turn("assistant", "The album pulled together a lot of", {
        interrupted: true,
      }),
    ]);

    expect(history[0].text).toContain("cut this answer off");
  });
});

/**
 * The archive lookup pastes older turns beside the live question. Firing it on
 * "what"/"just"/"could" is how a short conversational follow-up ("could go on")
 * got answered with a topic from ten turns back.
 */
describe("extractSearchTerms", () => {
  it("finds nothing to look up in a deictic follow-up", () => {
    expect(extractSearchTerms("what did I just say")).toEqual([]);
    expect(extractSearchTerms("could go on")).toEqual([]);
    expect(extractSearchTerms("what about what we were just talking about")).toEqual(
      []
    );
    expect(extractSearchTerms("yeah but what do you think")).toEqual([]);
  });

  it("still looks up questions that name something", () => {
    expect(extractSearchTerms("what did we say about the pricing page")).toEqual(
      expect.arrayContaining(["pricing", "page"])
    );
    expect(extractSearchTerms("who is your favorite rock band")).toEqual(
      expect.arrayContaining(["favorite", "rock", "band"])
    );
  });

  it("keeps early-session recall working through the stopword filter", () => {
    // Every content word here is a stopword except the intent word itself.
    const terms = extractSearchTerms("what were we talking about at the beginning");

    expect(terms).toContain("beginning");
    expect(terms).toContain("first");
    expect(terms).not.toContain("talking");
  });
});
