import { describe, expect, it } from "vitest";
import { isBackchannelOnly, isLikelyEchoOfAnswer } from "./echo-matcher";

const ANSWER =
  "I'd go with the tiered pricing. The free plan gets people in the door, " +
  "and the Pro tier at twenty dollars covers your Speechmatics cost with " +
  "room to spare. You should stop worrying about the Max tier for now.";

describe("isLikelyEchoOfAnswer", () => {
  it("flags a verbatim fragment of the answer as echo", () => {
    expect(
      isLikelyEchoOfAnswer(
        "the free plan gets people in the door and the pro tier",
        ANSWER
      )
    ).toBe(true);
  });

  it("flags a fragment with minor STT errors as echo", () => {
    expect(
      isLikelyEchoOfAnswer(
        "the Pro tier at twenty dollars covers your speech Matic cost",
        ANSWER
      )
    ).toBe(true);
  });

  it("does not flag a real interruption as echo", () => {
    expect(
      isLikelyEchoOfAnswer("no wait what about the enterprise customers", ANSWER)
    ).toBe(false);
  });

  it("flags one to two word utterances only on exact phrase match", () => {
    expect(isLikelyEchoOfAnswer("should stop", ANSWER)).toBe(true);
    // Single word present in the answer window matches too — the engine keeps
    // this honest by matching only against recently spoken text.
    expect(isLikelyEchoOfAnswer("stop", ANSWER)).toBe(true);
    expect(isLikelyEchoOfAnswer("hey kivo", ANSWER)).toBe(false);
  });

  it("does not flag a stop command when the recent answer window lacks the word", () => {
    expect(
      isLikelyEchoOfAnswer("stop", "the free plan gets people in the door")
    ).toBe(false);
  });

  it("does not condemn interruptions sharing only common words", () => {
    expect(
      isLikelyEchoOfAnswer("what does the free tier of cartesia include", ANSWER)
    ).toBe(false);
  });

  it("treats unintelligible/empty utterances as echo (drop)", () => {
    expect(isLikelyEchoOfAnswer("...", ANSWER)).toBe(true);
    expect(isLikelyEchoOfAnswer("", ANSWER)).toBe(true);
  });

  it("never calls anything echo against an empty answer", () => {
    expect(isLikelyEchoOfAnswer("stop", "")).toBe(false);
  });
});

describe("isBackchannelOnly", () => {
  it("recognizes pure acknowledgments", () => {
    expect(isBackchannelOnly("yeah exactly")).toBe(true);
    expect(isBackchannelOnly("oh nice")).toBe(true);
    expect(isBackchannelOnly("makes sense")).toBe(true);
    expect(isBackchannelOnly("mhm")).toBe(true);
    // Reactions, not just acknowledgments. "Okay, that's pretty cool" taken as
    // a question gets sent to the model with nothing to answer, and comes back
    // as a summary of whatever the room was last talking about.
    expect(isBackchannelOnly("okay that's pretty cool")).toBe(true);
    expect(isBackchannelOnly("damn that's crazy")).toBe(true);
    expect(isBackchannelOnly("I'm not sure")).toBe(true);
  });

  it("leaves short real questions alone", () => {
    for (const text of [
      "is it good",
      "why not",
      "tell me more",
      "what about Hawaii",
      "did it win any awards",
      "which one",
    ]) {
      expect(isBackchannelOnly(text), text).toBe(false);
    }
  });

  it("does not swallow real interruptions", () => {
    expect(isBackchannelOnly("no wait")).toBe(false);
    expect(isBackchannelOnly("yeah but what about pricing")).toBe(false);
    expect(isBackchannelOnly("can you compare them")).toBe(false);
  });
});
