import { describe, expect, it } from "vitest";
import {
  extractSearchTerms,
  hasEarlySessionSearchIntent,
  sanitizeQuestionText,
} from "@/lib/aria/context/question-text";
import {
  dedupeAdjacentContextTurns,
  filterContextEligibleTurns,
  shouldCompactSession,
} from "@/lib/aria/context/turn-selection";
import { estimateTokens } from "@/lib/aria/context/token-estimate";
import { formatTurnForContext } from "@/lib/sessions/repository";
import { exportSessionMarkdown } from "@/lib/sessions/export";
import type { SessionDetailResponse, TurnDoc } from "@/lib/sessions/types";

function turn(
  patch: Partial<TurnDoc> & Pick<TurnDoc, "id" | "role" | "text" | "sequence">
): TurnDoc {
  return {
    speaker: null,
    speakerName: null,
    sourceUtteranceIds: [],
    tokenEstimate: 100,
    summarized: false,
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

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
  it("returns false when below turn and token thresholds", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      turn({
        id: `t${i}`,
        role: "speaker",
        text: "hi",
        sequence: i + 1,
        tokenEstimate: 100,
      })
    );
    expect(shouldCompactSession(rows)).toBe(false);
  });

  it("returns true when eligible turn count exceeds recent window", () => {
    const rows = Array.from({ length: 21 }, (_, i) =>
      turn({
        id: `t${i}`,
        role: "speaker",
        text: "hi",
        sequence: i + 1,
        tokenEstimate: 50,
      })
    );
    expect(shouldCompactSession(rows)).toBe(true);
  });

  it("returns true at token threshold even with fewer turns", () => {
    expect(
      shouldCompactSession([
        turn({
          id: "1",
          role: "assistant",
          text: "x",
          sequence: 1,
          tokenEstimate: 5000,
        }),
        turn({
          id: "2",
          role: "speaker",
          text: "y",
          sequence: 2,
          tokenEstimate: 3000,
        }),
      ])
    ).toBe(true);
  });

  it("ignores user_question turns for compaction eligibility", () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) =>
        turn({
          id: `s${i}`,
          role: "speaker",
          text: "line",
          sequence: i + 1,
          tokenEstimate: 50,
        })
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        turn({
          id: `q${i}`,
          role: "user_question",
          text: "question?",
          sequence: 100 + i,
          tokenEstimate: 50,
        })
      ),
    ];
    expect(shouldCompactSession(rows)).toBe(false);
  });
});

describe("filterContextEligibleTurns", () => {
  it("keeps speaker and assistant only", () => {
    const rows = [
      turn({ id: "1", role: "speaker", text: "a", sequence: 1 }),
      turn({ id: "2", role: "user_question", text: "b", sequence: 2 }),
      turn({ id: "3", role: "assistant", text: "c", sequence: 3 }),
    ];
    expect(filterContextEligibleTurns(rows).map((t) => t.role)).toEqual([
      "speaker",
      "assistant",
    ]);
  });
});

describe("dedupeAdjacentContextTurns", () => {
  it("drops back-to-back duplicate speaker lines", () => {
    const rows = [
      turn({
        id: "1",
        role: "speaker",
        text: "Hey. How are you?",
        sequence: 1,
        speakerName: "Jack",
      }),
      turn({
        id: "2",
        role: "speaker",
        text: "Hey. How are you ?",
        sequence: 2,
        speakerName: "Jack",
      }),
      turn({
        id: "3",
        role: "assistant",
        text: "Good.",
        sequence: 3,
      }),
    ];
    expect(dedupeAdjacentContextTurns(rows)).toHaveLength(2);
  });
});

describe("sanitizeQuestionText", () => {
  it("collapses stuttered words and phrases", () => {
    expect(
      sanitizeQuestionText(
        "what was the what was the first first thing at the start start"
      )
    ).toBe("what was the first thing at the start");
  });

  it("strips leading wake prefix", () => {
    expect(sanitizeQuestionText("Hey Kivo, what is the plan?")).toBe(
      "what is the plan?"
    );
  });
});

describe("extractSearchTerms", () => {
  it("adds early-session hints for beginning questions", () => {
    const terms = extractSearchTerms(
      "what was the first thing at the beginning"
    );
    expect(terms).toContain("first");
    expect(terms).toContain("beginning");
    expect(hasEarlySessionSearchIntent("how did we start")).toBe(true);
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
        speakerName: null,
        sourceUtteranceIds: [],
        sequence: 1,
        tokenEstimate: 1,
        summarized: false,
        createdAt: new Date().toISOString(),
      })
    ).toBe("Kivo: Hello there.");

    expect(
      formatTurnForContext({
        id: "2",
        role: "user_question",
        text: "What did we decide?",
        speaker: 0,
        speakerName: "Maya",
        sourceUtteranceIds: [],
        sequence: 2,
        tokenEstimate: 1,
        summarized: false,
        createdAt: new Date().toISOString(),
      })
    ).toBe("Maya (question): What did we decide?");
  });
});

describe("exportSessionMarkdown", () => {
  it("includes summary, facts, and transcript", () => {
    const detail: SessionDetailResponse = {
      session: {
        id: "s1",
        title: "Planning",
        projectId: null,
        autoTitled: false,
        status: "active",
        speakerCount: 2,
        createdAt: "2026-05-24T00:00:00.000Z",
        updatedAt: "2026-05-24T01:00:00.000Z",
        endedAt: null,
        trashedAt: null,
        lastSummaryAt: null,
        tokenEstimate: 10,
        searchableTextPreview: "Firestore",
        turnCount: 1,
        pinned: false,
        mode: "in_person",
        botId: null,
        meetingPlatform: null,
        botStatus: null,
      },
      turns: [
        {
          id: "t1",
          role: "speaker",
          text: "Let's use Firestore.",
          speaker: 0,
          speakerName: null,
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
    expect(markdown).toContain("Other speaker: Let's use Firestore.");
  });
});
