import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sessions/repository", () => ({
  assertSessionOwner: vi.fn(),
  formatTurnForContext: vi.fn(),
  getCleanedTranscript: vi.fn(),
  getMeetingSummary: vi.fn(),
  listTurns: vi.fn(),
}));
vi.mock("@/lib/notes/repository", () => ({
  getEnhancedNotes: vi.fn(),
  getPersonalNotes: vi.fn(),
  markEnhancedNotesEmpty: vi.fn(),
  markEnhancedNotesFailed: vi.fn(),
  markEnhancedNotesGenerating: vi.fn(),
  writeGeneratedEnhancedNotes: vi.fn(),
}));
vi.mock("@/lib/aria/llm/anthropic-client", () => ({
  llmGenerateText: vi.fn(),
}));

import {
  ENHANCED_NOTES_SYSTEM_PROMPT,
  buildEnhancedNotesPrompt,
  transcriptHasEnoughToWriteFrom,
} from "@/lib/notes/enhance";
import type { TurnDoc } from "@/lib/sessions/types";

function turn(role: TurnDoc["role"]): TurnDoc {
  return {
    id: `t-${Math.random()}`,
    role,
    text: "x",
    speaker: 0,
    speakerName: null,
    sourceUtteranceIds: [],
    sequence: 1,
    tokenEstimate: 1,
    summarized: false,
    createdAt: "",
  };
}

describe("buildEnhancedNotesPrompt", () => {
  it("puts the owner's notes ahead of the transcript and says when they are empty", () => {
    const withNotes = buildEnhancedNotesPrompt({
      title: "Kickoff",
      notesText: "- budget 40k\n- ask Sam",
      transcript: "Sam: we agreed on forty",
      summary: null,
    });
    expect(withNotes.indexOf("The owner's own notes")).toBeLessThan(
      withNotes.indexOf("Transcript of the room")
    );
    expect(withNotes).toContain("budget 40k");
    expect(withNotes).toContain("Sam: we agreed on forty");

    const without = buildEnhancedNotesPrompt({
      title: "Kickoff",
      notesText: "",
      transcript: "Sam: hi",
      summary: null,
    });
    expect(without).toContain("They wrote nothing");
  });

  it("includes the existing summary when one exists", () => {
    const prompt = buildEnhancedNotesPrompt({
      title: "T",
      notesText: "",
      transcript: "",
      summary: {
        overview: "It was about pricing.",
        keyPoints: [],
        decisions: ["Charge more"],
        actionItems: ["Email Jo"],
        generatedAt: "",
        turnCountAtGeneration: 3,
      },
    });
    expect(prompt).toContain("It was about pricing.");
    expect(prompt).toContain("- Charge more");
    expect(prompt).toContain("- Email Jo");
  });

  it("asks for the sanitizer's tag subset and nothing else", () => {
    expect(ENHANCED_NOTES_SYSTEM_PROMPT).toContain("<h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>");
    expect(ENHANCED_NOTES_SYSTEM_PROMPT).toContain("no markdown");
  });
});

describe("transcriptHasEnoughToWriteFrom", () => {
  it("needs a few spoken turns; assistant turns do not count", () => {
    expect(transcriptHasEnoughToWriteFrom([turn("assistant"), turn("assistant"), turn("assistant")])).toBe(false);
    expect(transcriptHasEnoughToWriteFrom([turn("speaker"), turn("user_question")])).toBe(false);
    expect(transcriptHasEnoughToWriteFrom([turn("speaker"), turn("speaker"), turn("user_question")])).toBe(true);
  });
});
