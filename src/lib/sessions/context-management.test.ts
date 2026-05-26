import { describe, expect, it } from "vitest";
import { estimateTokens } from "@/lib/aria/context/token-estimate";
import { shouldCompactSession } from "@/lib/aria/context/build-context";
import { formatTurnForContext } from "@/lib/sessions/repository";
import { exportSessionMarkdown } from "@/lib/sessions/export";
import type { SessionDetailResponse } from "@/lib/sessions/types";

describe("estimateTokens", () => {
  it("returns zero for empty text", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("   ")).toBe(0);
  });

  it("uses a conservative chars-per-token ratio", () => {
    expect(estimateTokens("12345678")).toBe(2);
  });
});

describe("shouldCompactSession", () => {
  it("returns false below threshold", () => {
    expect(
      shouldCompactSession([{ tokenEstimate: 1000 }, { tokenEstimate: 2000 }])
    ).toBe(false);
  });

  it("returns true at or above threshold", () => {
    expect(
      shouldCompactSession([{ tokenEstimate: 5000 }, { tokenEstimate: 3000 }])
    ).toBe(true);
  });
});

describe("formatTurnForContext", () => {
  it("formats assistant, question, and speaker turns", () => {
    expect(
      formatTurnForContext({
        id: "1",
        role: "assistant",
        text: "Hello there.",
        speaker: null,
        sourceUtteranceIds: [],
        sequence: 1,
        tokenEstimate: 1,
        summarized: false,
        createdAt: new Date().toISOString(),
      })
    ).toBe("ARIA: Hello there.");

    expect(
      formatTurnForContext({
        id: "2",
        role: "user_question",
        text: "What did we decide?",
        speaker: 0,
        sourceUtteranceIds: [],
        sequence: 2,
        tokenEstimate: 1,
        summarized: false,
        createdAt: new Date().toISOString(),
      })
    ).toBe("Speaker 1 (question): What did we decide?");
  });
});

describe("exportSessionMarkdown", () => {
  it("includes summary, facts, and transcript", () => {
    const detail: SessionDetailResponse = {
      session: {
        id: "s1",
        title: "Planning",
        status: "active",
        speakerCount: 2,
        createdAt: "2026-05-24T00:00:00.000Z",
        updatedAt: "2026-05-24T01:00:00.000Z",
        endedAt: null,
        lastSummaryAt: null,
        tokenEstimate: 10,
        searchableTextPreview: "Firestore",
        turnCount: 1,
      },
      turns: [
        {
          id: "t1",
          role: "speaker",
          text: "Let's use Firestore.",
          speaker: 0,
          sourceUtteranceIds: [],
          sequence: 1,
          tokenEstimate: 2,
          summarized: false,
          createdAt: "2026-05-24T00:10:00.000Z",
        },
      ],
      summary: {
        rollingSummary: "Team chose Firestore.",
        keyDecisions: ["Use Firestore"],
        openQuestions: ["When to export?"],
        timeline: ["Discussed storage"],
        lastCoveredTurnId: "t1",
        updatedAt: "2026-05-24T00:20:00.000Z",
      },
      facts: [
        {
          id: "f1",
          text: "Prefer Firestore",
          category: "preference",
          pinned: false,
          sourceTurnId: "t1",
          createdAt: "2026-05-24T00:20:00.000Z",
          updatedAt: "2026-05-24T00:20:00.000Z",
        },
      ],
      pins: [],
    };

    const markdown = exportSessionMarkdown(detail);
    expect(markdown).toContain("# Planning");
    expect(markdown).toContain("Team chose Firestore.");
    expect(markdown).toContain("Prefer Firestore");
    expect(markdown).toContain("Speaker 1: Let's use Firestore.");
  });
});
