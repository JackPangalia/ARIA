import { describe, expect, it } from "vitest";
import {
  buildFullConversationExcerpt,
  buildListeningExcerpt,
  canAutoTitleSession,
  fallbackTitleFromText,
  getFirstQaPair,
  getSubstantiveSpeakerTurns,
  hasEnoughFinalizeContext,
  hasEnoughListeningContext,
  isGenericSessionTitle,
  isSubstantiveUtterance,
  sanitizeGeneratedTitle,
} from "@/lib/aria/context/auto-title";
import type { TurnDoc } from "@/lib/sessions/types";

function turn(
  patch: Partial<TurnDoc> & Pick<TurnDoc, "id" | "role" | "text" | "sequence">
): TurnDoc {
  return {
    speaker: null,
    speakerName: null,
    sourceUtteranceIds: [],
    tokenEstimate: 10,
    summarized: false,
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

describe("isGenericSessionTitle", () => {
  it("treats default session titles as generic", () => {
    expect(isGenericSessionTitle("Untitled session")).toBe(true);
    expect(isGenericSessionTitle("Untitled conversation")).toBe(true);
    expect(isGenericSessionTitle("Session 6/1/2026 2:30 PM")).toBe(true);
    expect(isGenericSessionTitle("Conversation 6/1/2026 2:30 PM")).toBe(true);
  });

  it("treats custom titles as non-generic", () => {
    expect(isGenericSessionTitle("Q3 budget review")).toBe(false);
  });
});

describe("canAutoTitleSession", () => {
  it("allows listening titles while the default name remains", () => {
    expect(
      canAutoTitleSession(
        { title: "Session 6/1/2026 2:30 PM", autoTitled: false },
        "listening"
      )
    ).toBe(true);
  });

  it("blocks listening titles after a user-chosen name", () => {
    expect(
      canAutoTitleSession(
        { title: "Board prep", autoTitled: false },
        "listening"
      )
    ).toBe(false);
  });

  it("allows Q&A to upgrade an auto-generated listening title", () => {
    expect(
      canAutoTitleSession(
        { title: "Morning check-in topics", autoTitled: true },
        "qa"
      )
    ).toBe(true);
  });

  it("does not overwrite a user-chosen title on Q&A", () => {
    expect(
      canAutoTitleSession({ title: "Board prep", autoTitled: false }, "qa")
    ).toBe(false);
  });

  it("lets the finalize pass override a prior auto-title", () => {
    expect(
      canAutoTitleSession(
        { title: "Morning check-in topics", autoTitled: true },
        "finalize"
      )
    ).toBe(true);
  });

  it("does not overwrite a user-chosen title on finalize", () => {
    expect(
      canAutoTitleSession({ title: "Board prep", autoTitled: false }, "finalize")
    ).toBe(false);
  });
});

describe("finalize context", () => {
  it("includes Q&A and substantive speaker turns, dropping greetings", () => {
    const turns = [
      turn({ id: "1", role: "speaker", text: "Hi", sequence: 1 }),
      turn({
        id: "2",
        role: "user_question",
        text: "What did we decide about the launch date?",
        sequence: 2,
      }),
      turn({ id: "3", role: "assistant", text: "You agreed on March 15.", sequence: 3 }),
    ];
    const excerpt = buildFullConversationExcerpt(turns);
    expect(excerpt).toContain("launch date");
    expect(excerpt).toContain("Kivo: You agreed on March 15.");
    expect(excerpt).not.toContain("Hi");
  });

  it("requires a Q&A pair or enough listening speech", () => {
    expect(hasEnoughFinalizeContext([])).toBe(false);
    const qa = [
      turn({ id: "1", role: "user_question", text: "Summarize the call", sequence: 1 }),
      turn({ id: "2", role: "assistant", text: "Here is the summary.", sequence: 2 }),
    ];
    expect(hasEnoughFinalizeContext(qa)).toBe(true);
  });
});

describe("listening context thresholds", () => {
  it("ignores filler speaker lines", () => {
    expect(isSubstantiveUtterance("yeah")).toBe(false);
    expect(isSubstantiveUtterance("Good morning everyone")).toBe(false);
    expect(
      isSubstantiveUtterance(
        "We need to finalize the Q3 budget before Friday."
      )
    ).toBe(true);
  });

  it("waits for enough substantive speech", () => {
    const sparse = [
      turn({
        id: "1",
        role: "speaker",
        text: "We should review the launch timeline today.",
        sequence: 1,
      }),
      turn({
        id: "2",
        role: "speaker",
        text: "Marketing still needs final assets from design.",
        sequence: 2,
      }),
    ];
    expect(hasEnoughListeningContext(sparse)).toBe(false);

    const enough = [
      ...sparse,
      turn({
        id: "3",
        role: "speaker",
        text: "The launch date depends on the API migration finishing first, and we need sign-off from platform.",
        sequence: 3,
      }),
    ];
    expect(hasEnoughListeningContext(enough)).toBe(true);
    expect(getSubstantiveSpeakerTurns(enough)).toHaveLength(3);
    expect(buildListeningExcerpt(enough)).toContain("launch timeline");
  });
});

describe("Q&A pairing", () => {
  it("finds the first question and answer", () => {
    const turns = [
      turn({
        id: "1",
        role: "speaker",
        text: "Let's talk about the budget.",
        sequence: 1,
      }),
      turn({
        id: "2",
        role: "user_question",
        text: "What did we decide about the launch date?",
        sequence: 2,
      }),
      turn({
        id: "3",
        role: "assistant",
        text: "You agreed on March 15.",
        sequence: 3,
      }),
    ];

    expect(getFirstQaPair(turns)).toEqual({
      question: "What did we decide about the launch date?",
      answer: "You agreed on March 15.",
    });
  });
});

describe("sanitizeGeneratedTitle", () => {
  it("strips labels, quotes, and trailing punctuation", () => {
    expect(sanitizeGeneratedTitle('"Launch date decision."')).toBe(
      "Launch date decision"
    );
    expect(sanitizeGeneratedTitle("Title: Budget review")).toBe(
      "Budget review"
    );
  });

  it("falls back to the first words of the source text", () => {
    expect(
      sanitizeGeneratedTitle("", "What did we decide about pricing?")
    ).toBe("What did we decide about");
  });

  it("builds a short fallback phrase", () => {
    expect(
      fallbackTitleFromText("What did we decide about the launch date?")
    ).toBe("What did we decide about");
  });
});
