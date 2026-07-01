import { describe, expect, it } from "vitest";
import {
  detectCloseWord,
  extractQuestionAfterWake,
  extractQuestionAfterWakeMeeting,
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
