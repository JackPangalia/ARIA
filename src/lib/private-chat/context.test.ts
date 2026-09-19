import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/aria/context/build-context", () => ({
  buildContextBundle: vi.fn(),
}));

import { composePrivateChatContext } from "@/lib/private-chat/context";
import { EMPTY_ENHANCED_NOTES, EMPTY_PERSONAL_NOTES } from "@/lib/notes/types";

const room = {
  stableContext: "# Session\nTitle: Kickoff",
  liveTranscript: "# Archive lookup\n\nOld line",
  history: [
    { role: "user" as const, text: "Sam: the budget is forty" },
    { role: "assistant" as const, text: "Forty thousand, per Sam." },
  ],
};

describe("composePrivateChatContext", () => {
  it("frames the chat as private and lays the room, notes, and enhanced notes into the stable context", () => {
    const context = composePrivateChatContext({
      room,
      personal: { ...EMPTY_PERSONAL_NOTES, content: "<p>ask about <strong>Q4</strong></p>" },
      enhanced: { ...EMPTY_ENHANCED_NOTES, status: "ready", content: "<h2>Budget</h2><p>Forty.</p>" },
      chatHistory: [],
      question: "what did Sam say?",
    });
    expect(context.stableContext).toContain("private, written chat");
    expect(context.stableContext).toContain("Title: Kickoff");
    expect(context.stableContext).toContain("Sam: the budget is forty");
    expect(context.stableContext).toContain("Kivo (spoken aloud to the room): Forty thousand, per Sam.");
    expect(context.stableContext).toContain("The owner's own notes\n\nask about Q4");
    expect(context.stableContext).toContain("Enhanced notes");
    expect(context.stableContext).toContain("Budget\nForty.");
    expect(context.liveTranscript).toBe(room.liveTranscript);
    expect(context.tokenEstimate).toBeGreaterThan(0);
  });

  it("uses the chat's own thread as history, not the room turns", () => {
    const context = composePrivateChatContext({
      room,
      personal: EMPTY_PERSONAL_NOTES,
      enhanced: EMPTY_ENHANCED_NOTES,
      chatHistory: [
        { id: "1", role: "user", text: "first", sequence: 1, createdAt: "" },
        { id: "2", role: "assistant", text: "partial", sequence: 2, createdAt: "", interrupted: true },
      ],
      question: "next",
    });
    expect(context.history).toEqual([
      { role: "user", text: "first" },
      { role: "assistant", text: "partial\n\n[The user stopped this answer here.]" },
    ]);
    expect(context.history.some((turn) => turn.text.includes("Sam:"))).toBe(false);
  });

  it("leaves unfinished enhanced notes out", () => {
    const context = composePrivateChatContext({
      room,
      personal: EMPTY_PERSONAL_NOTES,
      enhanced: { ...EMPTY_ENHANCED_NOTES, status: "generating", content: "<p>stale</p>" },
      chatHistory: [],
      question: "q",
    });
    expect(context.stableContext).not.toContain("Enhanced notes");
  });
});
