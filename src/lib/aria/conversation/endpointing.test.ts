import { describe, expect, it } from "vitest";
import { assessQuestionCompleteness } from "./endpointing";

describe("assessQuestionCompleteness", () => {
  it("sends punctuated questions immediately", () => {
    expect(
      assessQuestionCompleteness("What does Speechmatics cost per hour?")
    ).toBe("clear-ask");
    expect(assessQuestionCompleteness("why?")).toBe("clear-ask");
  });

  it("grades the final clause, not the ramble that led to it", () => {
    expect(
      assessQuestionCompleteness(
        "Okay so we've been working on the pricing page. Conversion dropped last week. So what should we change?"
      )
    ).toBe("clear-ask");
  });

  it("sends directed imperatives immediately", () => {
    expect(assessQuestionCompleteness("give me the short version")).toBe(
      "clear-ask"
    );
    expect(
      assessQuestionCompleteness(
        "so about all that. compare cartesia and elevenlabs on price"
      )
    ).toBe("clear-ask");
  });

  it("treats unpunctuated question shapes as likely asks — short beat", () => {
    expect(
      assessQuestionCompleteness("how much does the pro tier cost")
    ).toBe("likely-ask");
    expect(
      assessQuestionCompleteness("do you think the free tier is too generous")
    ).toBe("likely-ask");
  });

  it("holds on statements — rambling context is not a request for an answer", () => {
    expect(
      assessQuestionCompleteness("Okay so I've been working on the landing page.")
    ).toBe("statement");
    expect(
      assessQuestionCompleteness("the conversion numbers dropped last week")
    ).toBe("statement");
    expect(assessQuestionCompleteness("the pricing page")).toBe("statement");
  });

  it("holds hardest on openly unfinished tails", () => {
    expect(assessQuestionCompleteness("what should we use for the")).toBe(
      "unfinished"
    );
    expect(assessQuestionCompleteness("so the pricing would be, um")).toBe(
      "unfinished"
    );
    expect(assessQuestionCompleteness("what is the difference between")).toBe(
      "unfinished"
    );
    expect(assessQuestionCompleteness("what's")).toBe("unfinished");
    expect(assessQuestionCompleteness("what's the")).toBe("unfinished");
    expect(assessQuestionCompleteness("")).toBe("unfinished");
  });

  it("does not fast-send a wh-cleft statement", () => {
    // "what we need is more budget" is a statement despite starting with
    // "what" — likely-ask at most, never clear-ask.
    expect(
      assessQuestionCompleteness("what we need is more budget")
    ).not.toBe("clear-ask");
  });
});
