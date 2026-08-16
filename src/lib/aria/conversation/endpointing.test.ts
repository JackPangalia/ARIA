import { describe, expect, it } from "vitest";
import {
  assessQuestionCompleteness,
  END_OF_UTTERANCE_GRACE_MS,
  graceMsFor,
  SETTLE_MS,
  settleMsFor,
  shouldForceEndpoint,
  shouldSpeculateAsk,
} from "./endpointing";

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

  it("treats yield closers as a completed turn", () => {
    expect(assessQuestionCompleteness("alright yeah")).toBe("complete-turn");
    expect(assessQuestionCompleteness("that's it")).toBe("complete-turn");
    expect(assessQuestionCompleteness("that’s it.")).toBe("complete-turn");
    expect(assessQuestionCompleteness("alright, yeah")).toBe("complete-turn");
    expect(assessQuestionCompleteness("anyway")).toBe("complete-turn");
    expect(assessQuestionCompleteness("so yeah")).toBe("complete-turn");
    expect(
      assessQuestionCompleteness("we've been looking at pricing. alright yeah")
    ).toBe("complete-turn");
  });

  it("treats punctuated briefings as a completed turn", () => {
    expect(
      assessQuestionCompleteness("Okay so we have been looking at pricing.")
    ).toBe("complete-turn");
    expect(
      assessQuestionCompleteness("Okay so I've been working on the landing page.")
    ).toBe("complete-turn");
  });

  it("holds on unpunctuated statements — rambling context is not a request for an answer", () => {
    expect(
      assessQuestionCompleteness("Okay so I've been working on the landing page")
    ).toBe("statement");
    expect(
      assessQuestionCompleteness("the conversion numbers dropped last week")
    ).toBe("statement");
    expect(assessQuestionCompleteness("the pricing page")).toBe("statement");
  });

  it("does not treat bare continuation words as yield closers", () => {
    expect(assessQuestionCompleteness("so")).toBe("unfinished");
    expect(assessQuestionCompleteness("right")).toBe("unfinished");
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
    expect(assessQuestionCompleteness("and the")).toBe("unfinished");
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

describe("graceMsFor / settleMsFor", () => {
  it("keeps residual grace short on asks and completed turns", () => {
    expect(graceMsFor("clear-ask", false)).toBe(80);
    expect(graceMsFor("clear-ask", true)).toBe(80);
    expect(graceMsFor("likely-ask", false)).toBe(250);
    expect(graceMsFor("likely-ask", true)).toBe(250);
    expect(graceMsFor("complete-turn", false)).toBe(400);
    expect(graceMsFor("complete-turn", true)).toBe(400);
  });

  it("is more patient on first-wake statements than follow-ups", () => {
    expect(graceMsFor("statement", false)).toBe(900);
    expect(graceMsFor("statement", true)).toBe(550);
    expect(graceMsFor("unfinished", false)).toBe(2400);
    expect(graceMsFor("unfinished", true)).toBe(1800);
  });

  it("keeps settle longer than residual grace in both modes", () => {
    for (const completeness of Object.keys(END_OF_UTTERANCE_GRACE_MS) as Array<
      keyof typeof END_OF_UTTERANCE_GRACE_MS
    >) {
      expect(settleMsFor(completeness, false)).toBeGreaterThan(
        graceMsFor(completeness, false)
      );
      expect(settleMsFor(completeness, true)).toBeGreaterThan(
        graceMsFor(completeness, true)
      );
    }
    expect(SETTLE_MS.statement).toBeGreaterThan(END_OF_UTTERANCE_GRACE_MS.statement);
  });
});

describe("shouldForceEndpoint", () => {
  it("always forces asks and yield closers", () => {
    expect(shouldForceEndpoint("clear-ask", "what should we charge?")).toBe(
      true
    );
    expect(
      shouldForceEndpoint("likely-ask", "how much does the pro tier cost")
    ).toBe(true);
    expect(shouldForceEndpoint("complete-turn", "alright yeah")).toBe(true);
    expect(shouldForceEndpoint("complete-turn", "that's it")).toBe(true);
  });

  it("does not force punctuated briefings or statements", () => {
    expect(
      shouldForceEndpoint(
        "complete-turn",
        "Okay so we have been looking at pricing."
      )
    ).toBe(false);
    expect(
      shouldForceEndpoint(
        "statement",
        "so I've been looking at the landing page numbers"
      )
    ).toBe(false);
  });

  it("never forces unfinished drafts", () => {
    expect(shouldForceEndpoint("unfinished", "and the")).toBe(false);
  });
});

describe("shouldSpeculateAsk", () => {
  it("speculates on asks and completed turns", () => {
    expect(shouldSpeculateAsk("clear-ask", false)).toBe(true);
    expect(shouldSpeculateAsk("likely-ask", false)).toBe(true);
    expect(shouldSpeculateAsk("complete-turn", false)).toBe(true);
  });

  it("speculates on statements only on follow-up", () => {
    expect(shouldSpeculateAsk("statement", false)).toBe(false);
    expect(shouldSpeculateAsk("statement", true)).toBe(true);
  });

  it("never speculates on unfinished drafts", () => {
    expect(shouldSpeculateAsk("unfinished", false)).toBe(false);
    expect(shouldSpeculateAsk("unfinished", true)).toBe(false);
  });
});
