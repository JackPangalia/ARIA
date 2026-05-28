import { describe, expect, it } from "vitest";
import { questionLikelyNeedsSearch } from "./search-gating";

describe("questionLikelyNeedsSearch", () => {
  it("returns false for casual or room-only questions", () => {
    expect(questionLikelyNeedsSearch("What do you think about our roadmap?")).toBe(
      false
    );
    expect(questionLikelyNeedsSearch("Hey Kivo, can you recap what we said?")).toBe(
      false
    );
    expect(questionLikelyNeedsSearch("You .")).toBe(false);
  });

  it("returns true for explicit search requests", () => {
    expect(
      questionLikelyNeedsSearch("Can you search for the latest FDA ruling?")
    ).toBe(true);
    expect(questionLikelyNeedsSearch("Google the weather in Austin")).toBe(true);
  });

  it("returns true for current-events phrasing", () => {
    expect(
      questionLikelyNeedsSearch(
        "What do you think about the current global situation?"
      )
    ).toBe(true);
    expect(
      questionLikelyNeedsSearch(
        "What's going on in the world right now?"
      )
    ).toBe(true);
  });

  it("returns false for world opinion without news or search cues", () => {
    expect(
      questionLikelyNeedsSearch("What do you think about the world?")
    ).toBe(false);
  });
});
