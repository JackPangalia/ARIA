import { describe, expect, it } from "vitest";
import { decideQuestionFold, type TurnLike } from "./question-fold";

const q = (id: string, text: string): TurnLike => ({
  id,
  role: "user_question",
  text,
});
const a = (id: string, text: string, interrupted = false): TurnLike => ({
  id,
  role: "assistant",
  text,
  interrupted,
});

describe("decideQuestionFold", () => {
  it("appends an unrelated question", () => {
    expect(decideQuestionFold([q("q1", "how tall is Everest")], "what time is it"))
      .toEqual({ mode: "append" });
  });

  it("appends when there is no history", () => {
    expect(decideQuestionFold([], "what time is it")).toEqual({ mode: "append" });
  });

  it("supersedes across cut-off answers and drops their fragments", () => {
    const fold = decideQuestionFold(
      [
        a("a2", "Yeah,", true),
        a("a1", "Leg drive on incline press is normal— You", true),
        q("q1", "so I did sixty pound incline press"),
      ],
      "so I did sixty pound incline press and I was using a lot of leg drive"
    );
    expect(fold).toEqual({
      mode: "supersede",
      targetId: "q1",
      text: "so I did sixty pound incline press and I was using a lot of leg drive",
      dropTurnIds: ["a2", "a1"],
    });
  });

  it("trims the answered half when a complete answer sits in between", () => {
    const fold = decideQuestionFold(
      [
        a("a1", "That's solid work — incline press is tough."),
        q("q1", "So yesterday I did 60lb incline press for seven reps."),
      ],
      "So yesterday I did 60lb incline press for seven reps. And anyways, I was using a lot of leg drive."
    );
    expect(fold).toEqual({
      mode: "trim",
      text: "And anyways, I was using a lot of leg drive.",
    });
  });

  it("folds a pure re-delivery that adds no words", () => {
    const fold = decideQuestionFold(
      [a("a1", "Sure."), q("q1", "what time is it")],
      "What time is it?"
    );
    expect(fold).toEqual({ mode: "fold", targetId: "q1" });
  });

  it("ignores punctuation and case when matching the prefix", () => {
    const fold = decideQuestionFold(
      [q("q1", "so I did 60 lb incline press")],
      "So, I did 60 lb incline press — and my calf cramped."
    );
    expect(fold.mode).toBe("supersede");
  });

  it("stops at a speaker turn rather than reaching past it", () => {
    const fold = decideQuestionFold(
      [
        { id: "s1", role: "speaker", text: "someone else talking" },
        q("q1", "what time"),
      ],
      "what time is it"
    );
    expect(fold).toEqual({ mode: "append" });
  });

  it("does not fold a shorter question into a longer one", () => {
    const fold = decideQuestionFold(
      [q("q1", "what time is it in Tokyo")],
      "what time is it"
    );
    expect(fold).toEqual({ mode: "append" });
  });

  it("supersedes a re-delivery that drops a filler word", () => {
    // The same sentence decoded twice: the second pass lost "Okay,". Matching
    // word-for-word, this used to read as an unrelated new question.
    const fold = decideQuestionFold(
      [
        a("a1", "I'm", true),
        q("q1", "Actually, can you tell me? Okay, so this is what happened pretty much"),
      ],
      "Actually, can you tell me? so this is what happened pretty much. So I was out on a stroll around Stanley Park."
    );
    expect(fold).toEqual({
      mode: "supersede",
      targetId: "q1",
      text: "Actually, can you tell me? so this is what happened pretty much. So I was out on a stroll around Stanley Park.",
      dropTurnIds: ["a1"],
    });
  });

  it("keeps the new tail out of the matched prefix", () => {
    const fold = decideQuestionFold(
      [q("q1", "so I did sixty pound incline press today")],
      "so I did sixty pound incline press today and my calf cramped"
    );
    expect(fold).toMatchObject({ mode: "supersede" });
  });

  it("still appends when a short question merely rhymes with the last one", () => {
    // Three words, so no budget at all: one different word is a new question.
    const fold = decideQuestionFold(
      [q("q1", "what time is")],
      "what date is it"
    );
    expect(fold).toEqual({ mode: "append" });
  });

  it("appends when the overlap is too damaged to be one thought", () => {
    const fold = decideQuestionFold(
      [q("q1", "how tall is Mount Everest in feet")],
      "who won the game last night in Toronto"
    );
    expect(fold).toEqual({ mode: "append" });
  });
});
