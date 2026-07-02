import { describe, expect, it } from "vitest";
import {
  detectStopWord,
  detectTrailingStop,
  detectCloseWord,
  END_OF_UTTERANCE_GRACE_MS,
  extractQuestionAfterWake,
  extractQuestionAfterWakeMeeting,
  QUESTION_SETTLE_MS,
  SPEECH_FINAL_SETTLE_MS,
} from "./wake";

describe("extractQuestionAfterWake", () => {
  it("matches canonical Kivo spellings", () => {
    expect(extractQuestionAfterWake("kivo what are your thoughts")).toEqual({
      detected: true,
      question: "what are your thoughts",
    });
    expect(extractQuestionAfterWake("hey kivo, what's up")).toEqual({
      detected: true,
      question: "what's up",
    });
  });

  it("matches common Recall ASR mishearings from meeting-bot logs", () => {
    const question = "what are your thoughts on everything";
    for (const prefix of [
      "kiva",
      "kibo",
      "kiwo",
      "ki vo",
      "evo",
    ]) {
      expect(extractQuestionAfterWake(`${prefix} ${question}`)).toEqual({
        detected: true,
        question,
      });
    }
  });

  it("does not false-positive on unrelated speech", () => {
    expect(extractQuestionAfterWake("what are your thoughts on everything")).toEqual({
      detected: false,
      question: "",
    });
  });
});

describe("detectCloseWord", () => {
  it("matches 'thank you, Kivo' style close phrases", () => {
    for (const phrase of [
      "thank you kivo",
      "thank you, Kivo",
      "thanks kivo",
      "thanks, kivo",
      "okay thank you kivo",
      "thank you keevo", // ASR mishear
    ]) {
      expect(detectCloseWord(phrase)).toBe(true);
    }
  });

  it("does not close on a bare thank you without the name", () => {
    expect(detectCloseWord("thank you so much for that")).toBe(false);
    expect(detectCloseWord("thanks everyone")).toBe(false);
    expect(detectCloseWord("that was helpful")).toBe(false);
  });
});

describe("detectStopWord", () => {
  it("matches short whole-utterance stop commands", () => {
    for (const phrase of [
      "stop",
      "okay stop",
      "shut up",
      "that's enough",
      "thank you",
      "kivo stop",
      "thank you, Kivo",
    ]) {
      expect(detectStopWord(phrase)).toBe(true);
    }
  });

  it("requires Kivo in strict mode", () => {
    expect(detectStopWord("stop", { requireWakeWord: true })).toBe(false);
    expect(detectStopWord("Kivo stop", { requireWakeWord: true })).toBe(true);
    expect(detectStopWord("thank you, Kivo", { requireWakeWord: true })).toBe(
      true
    );
  });

  it("does not match longer speech that merely contains a stop word", () => {
    expect(detectStopWord("we should stop and think about it")).toBe(false);
    expect(detectStopWord("thank you for walking through all of that")).toBe(
      false
    );
  });

  it("matches filler-prefixed and repeated stop commands", () => {
    for (const phrase of [
      "just shut up",
      "please stop",
      "just stop",
      "shut up shut up",
      "shut up! shut up!",
      "stop stop",
      "Kivo. Just shut up.",
    ]) {
      expect(detectStopWord(phrase)).toBe(true);
    }
  });
});

describe("detectTrailingStop", () => {
  it("matches a stop command in the final clause of a longer utterance", () => {
    expect(
      detectTrailingStop("that is the goal of the app. Stop.")
    ).toBe(true);
    expect(
      detectTrailingStop("stocking goal of the app . Stop .")
    ).toBe(true);
    expect(detectTrailingStop("okay great work everyone. Thank you.")).toBe(
      true
    );
  });

  it("does not match single-clause utterances (no sentence boundary)", () => {
    expect(detectTrailingStop("we should stop and think about it")).toBe(
      false
    );
    expect(detectTrailingStop("stop")).toBe(false);
  });

  it("does not match a final clause that isn't a stop phrase", () => {
    expect(
      detectTrailingStop("let's build the app. It's about birds.")
    ).toBe(false);
  });
});

describe("voice-mode timing constants", () => {
  it("uses fast turn-taking defaults", () => {
    expect(QUESTION_SETTLE_MS).toBe(1500);
    expect(SPEECH_FINAL_SETTLE_MS).toBe(1500);
    expect(END_OF_UTTERANCE_GRACE_MS).toBe(250);
  });
});

describe("extractQuestionAfterWakeMeeting", () => {
  it("matches fuzzy Recall mishears strict mode misses", () => {
    expect(
      extractQuestionAfterWakeMeeting("hey kvio what do you think")
    ).toEqual({
      detected: true,
      question: "what do you think",
    });
    expect(extractQuestionAfterWakeMeeting("kivio summarize the call")).toEqual({
      detected: true,
      question: "summarize the call",
    });
  });

  it("does not false-positive on unrelated speech", () => {
    expect(
      extractQuestionAfterWakeMeeting("what are your thoughts on everything")
    ).toEqual({
      detected: false,
      question: "",
    });
  });
});
