import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/lib/env";
import type { SessionDoc } from "@/lib/sessions/types";

const appendTurn = vi.hoisted(() => vi.fn(async () => ({})));
const agentCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const contextCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const streamState = vi.hoisted(() => ({ mode: "complete" as "complete" | "abort" }));

vi.mock("@/lib/aria/agent", () => ({
  runAriaAgentStream: async (input: {
    signal: AbortSignal;
    [key: string]: unknown;
  }) => {
    agentCalls.push(input);
    return new ReadableStream<string>({
      start(controller) {
        if (streamState.mode === "complete") {
          controller.enqueue("A concise ");
          controller.enqueue("**written** answer.");
          controller.close();
          return;
        }

        controller.enqueue("Partial answer");
        input.signal.addEventListener(
          "abort",
          () =>
            controller.error(
              new DOMException("The operation was aborted.", "AbortError")
            ),
          { once: true }
        );
      },
    });
  },
}));

vi.mock("@/lib/aria/context/build-context", () => ({
  buildContextBundle: async (input: Record<string, unknown>) => {
    contextCalls.push(input);
    return {
      messages: "meeting context",
      history: [],
      question: input.question,
      tokenEstimate: 4,
      log: {},
    };
  },
}));

vi.mock("@/lib/aria/context/summarize", () => ({
  maybeCompactSession: vi.fn(async () => null),
}));
vi.mock("@/lib/sessions/repository", () => ({ appendTurn }));
vi.mock("@/lib/plan/repository", () => ({
  recordAsk: vi.fn(async () => undefined),
}));
vi.mock("@/lib/aria/context/auto-title", () => ({
  autoTitleSession: vi.fn(),
}));

import { runChatPipeline } from "./chat-pipeline";

const session: SessionDoc = {
  id: "session",
  title: "Planning",
  projectId: null,
  autoTitled: false,
  status: "ended",
  speakerCount: 2,
  pinned: false,
  createdAt: "",
  updatedAt: "",
  endedAt: "",
  trashedAt: null,
  lastSummaryAt: null,
  tokenEstimate: 0,
  searchableTextPreview: "",
  turnCount: 3,
  mode: "in_person",
  transcriptionMode: "speaker",
  botId: null,
  meetingPlatform: null,
  botStatus: null,
};

const env = {
  ANTHROPIC_API_KEY: "test",
  CARTESIA_API_KEY: "test",
  CARTESIA_MODEL_ID: "sonic-3",
  CARTESIA_VOICE_ID: "voice",
  SPEECHMATICS_API_KEY: "test",
  SPEECHMATICS_RT_REGION: "us",
  RECALL_TRANSCRIPT_MODE: "low_latency",
} as ServerEnv;

describe("runChatPipeline", () => {
  beforeEach(() => {
    appendTurn.mockClear();
    agentCalls.length = 0;
    contextCalls.length = 0;
    streamState.mode = "complete";
  });

  it("selects text delivery and persists the shared Q/A exchange", async () => {
    const result = await runChatPipeline({
      uid: "user",
      session,
      question: "What did we decide?",
      env,
      signal: new AbortController().signal,
    });

    expect(await new Response(result.textStream).text()).toBe(
      "A concise **written** answer."
    );
    await result.done;

    expect(agentCalls[0]).toMatchObject({
      delivery: "text",
      question: "What did we decide?",
    });
    expect(contextCalls[0]).toMatchObject({ includeMeetingSummary: true });
    const writes = appendTurn.mock.calls.map(
      (call) => (call as unknown[])[2] as Record<string, unknown>
    );
    expect(writes).toEqual([
      expect.objectContaining({
        role: "user_question",
        text: "What did we decide?",
      }),
      expect.objectContaining({
        role: "assistant",
        text: "A concise **written** answer.",
      }),
    ]);
  });

  it("fails before generation when the question cannot be persisted", async () => {
    appendTurn.mockRejectedValueOnce(new Error("Firestore unavailable"));

    await expect(
      runChatPipeline({
        uid: "user",
        session,
        question: "What did we decide?",
        env,
        signal: new AbortController().signal,
      })
    ).rejects.toThrow("Firestore unavailable");

    expect(agentCalls).toHaveLength(0);
    expect(appendTurn).toHaveBeenCalledTimes(1);
    const questionWrite = (appendTurn.mock.calls[0] as unknown[])[2];
    expect(questionWrite).toMatchObject({
      role: "user_question",
    });
  });

  it("persists one interrupted partial answer when aborted", async () => {
    streamState.mode = "abort";
    const controller = new AbortController();
    const result = await runChatPipeline({
      uid: "user",
      session: { ...session, status: "active" },
      question: "Keep going",
      env,
      signal: controller.signal,
    });
    const reader = result.textStream.getReader();

    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe("Partial answer");
    controller.abort();
    expect((await reader.read()).done).toBe(true);
    await result.done;

    const assistantWrites = appendTurn.mock.calls
      .map((call) => (call as unknown[])[2] as Record<string, unknown>)
      .filter((turn) => turn.role === "assistant");
    expect(assistantWrites).toEqual([
      expect.objectContaining({
        text: "Partial answer",
        interrupted: true,
      }),
    ]);
    expect(contextCalls[0]).toMatchObject({ includeMeetingSummary: false });
  });
});
