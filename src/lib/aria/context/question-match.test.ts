import { describe, expect, it } from "vitest";
import {
  questionExtendsDraft,
  questionsMatchForContext,
} from "./question-text";

describe("questionsMatchForContext", () => {
  it("matches a live partial against the punctuated final", () => {
    // The whole point: speculation fires on the partial and is adopted against
    // the final. Speechmatics only punctuates the final, so an exact comparison
    // threw away the pre-warm on every question it ended with a "?".
    expect(
      questionsMatchForContext(
        "what is this meeting about",
        "What is this meeting about?"
      )
    ).toBe(true);
  });

  it("ignores casing, commas, and spacing", () => {
    expect(
      questionsMatchForContext(
        "so what should we charge for the pro tier",
        "So, what should we charge for the Pro tier?"
      )
    ).toBe(true);
  });

  it("still rejects a question that gained words", () => {
    expect(
      questionsMatchForContext(
        "what should we charge",
        "what should we charge for the pro tier?"
      )
    ).toBe(false);
  });

  it("rejects a different question of the same shape", () => {
    expect(
      questionsMatchForContext("how tall is it?", "how old is it?")
    ).toBe(false);
  });

  it("treats a curly apostrophe as the same word", () => {
    expect(questionsMatchForContext("what's the plan", "What’s the plan?")).toBe(
      true
    );
  });

  it("never matches empty input", () => {
    expect(questionsMatchForContext("", "anything")).toBe(false);
    expect(questionsMatchForContext("   ", "  ")).toBe(false);
  });
});

describe("questionExtendsDraft", () => {
  it("recognizes a flickered shorter partial behind a longer in-flight ask", () => {
    expect(
      questionExtendsDraft(
        "what should we",
        "what should we charge for the pro tier?"
      )
    ).toBe(true);
  });

  it("is true for an identical question", () => {
    expect(questionExtendsDraft("how tall is it", "How tall is it?")).toBe(true);
  });

  it("is false when the draft genuinely diverges", () => {
    expect(
      questionExtendsDraft("what should we do", "what should they do next")
    ).toBe(false);
  });

  it("does not match on a partial word boundary", () => {
    // "who" must not read as a prefix of "whose team is this".
    expect(questionExtendsDraft("who", "whose team is this")).toBe(false);
  });
});
