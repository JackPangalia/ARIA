import { describe, expect, it } from "vitest";
import type { TurnDoc } from "@/lib/sessions/types";
import {
  buildChatHistory,
  isOptimisticExchangePersisted,
  reconcileChatHistory,
  type OptimisticChatExchange,
} from "./history";

function turn(
  id: string,
  sequence: number,
  role: TurnDoc["role"],
  text: string
): TurnDoc {
  return {
    id,
    role,
    text,
    speaker: null,
    speakerName: null,
    sourceUtteranceIds: [],
    sequence,
    tokenEstimate: 1,
    summarized: false,
    createdAt: `2026-01-01T00:00:0${sequence}.000Z`,
  };
}

function optimistic(
  overrides: Partial<OptimisticChatExchange> = {}
): OptimisticChatExchange {
  return {
    id: "client-1",
    question: "What did we decide?",
    answer: "Ship on Friday.",
    afterSequence: 3,
    status: "complete",
    ...overrides,
  };
}

describe("chat history helpers", () => {
  it("renders only persisted question and assistant turns in sequence order", () => {
    const history = buildChatHistory([
      turn("a", 3, "assistant", "Answer"),
      turn("speaker", 1, "speaker", "Room transcript"),
      turn("q", 2, "user_question", "Question"),
    ]);

    expect(history.map(({ role, text }) => ({ role, text }))).toEqual([
      { role: "user", text: "Question" },
      { role: "assistant", text: "Answer" },
    ]);
  });

  it("reconciles a canonical exchange without duplicate optimistic bubbles", () => {
    const turns = [
      turn("old-q", 1, "user_question", "What did we decide?"),
      turn("old-a", 2, "assistant", "Nothing yet."),
      turn("room", 3, "speaker", "Let's ship Friday."),
      turn("new-q", 4, "user_question", "What did we decide?"),
      turn("new-a", 5, "assistant", "Ship on Friday."),
    ];

    const history = reconcileChatHistory(turns, optimistic());

    expect(history).toHaveLength(4);
    expect(history.filter((message) => message.sequence === null)).toEqual([]);
    expect(isOptimisticExchangePersisted(turns, optimistic())).toBe(true);
  });

  it("keeps only the optimistic answer when the question persisted first", () => {
    const history = reconcileChatHistory(
      [turn("q", 4, "user_question", "What did we decide?")],
      optimistic({ answer: "Ship", status: "streaming" })
    );

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ id: "turn-q", role: "user" });
    expect(history[1]).toMatchObject({
      id: "client-1-answer",
      role: "assistant",
      text: "Ship",
      status: "streaming",
    });
  });

  it.each(["complete", "cancelled", "error"] as const)(
    "uses canonical partials without a stale %s retry overlay",
    (status) => {
      const history = reconcileChatHistory(
        [
          turn("q", 4, "user_question", "What did we decide?"),
          { ...turn("a", 5, "assistant", "Ship"), interrupted: true },
        ],
        optimistic({
          answer: "Ship",
          status,
          error: "Answer stopped.",
        })
      );

      expect(history.at(-1)).toMatchObject({
        id: "turn-a",
        status: "persisted",
        interrupted: true,
      });
      expect(history.at(-1)).not.toHaveProperty("error");
      expect(history.filter((message) => message.sequence === null)).toEqual([]);
    }
  );
});
