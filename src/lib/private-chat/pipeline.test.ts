import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/lib/env";
import type { SessionDoc } from "@/lib/sessions/types";

const chatWrites = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const agentCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const streamState = vi.hoisted(() => ({ mode: "complete" as "complete" | "abort" }));
const forbidden = vi.hoisted(() => ({
  appendTurn: vi.fn(),
  maybeCompactSession: vi.fn(),
  storePrefetchedContext: vi.fn(),
  autoTitleSession: vi.fn(),
}));

vi.mock("@/lib/aria/agent", () => ({
  runAriaAgentStream: async (input: { signal: AbortSignal; [key: string]: unknown }) => {
    agentCalls.push(input);
    return new ReadableStream<string>({
      start(controller) {
        if (streamState.mode === "complete") {
          controller.enqueue("Private ");
          controller.enqueue("answer.");
          controller.close();
          return;
        }
        controller.enqueue("Partial");
        input.signal.addEventListener(
          "abort",
          () => controller.error(new DOMException("The operation was aborted.", "AbortError")),
          { once: true }
        );
      },
    });
  },
}));
vi.mock("@/lib/aria/context/build-context", () => ({
  buildContextBundle: async () => ({
    messages: "room",
    stableContext: "room",
    liveTranscript: "",
    history: [{ role: "user", text: "Sam: hello" }],
    question: "q",
    tokenEstimate: 2,
    log: {},
  }),
}));
vi.mock("@/lib/sessions/repository", () => ({ appendTurn: forbidden.appendTurn }));
vi.mock("@/lib/aria/context/summarize", () => ({ maybeCompactSession: forbidden.maybeCompactSession }));
vi.mock("@/lib/sessions/context-prefetch-cache", () => ({ storePrefetchedContext: forbidden.storePrefetchedContext }));
vi.mock("@/lib/aria/context/auto-title", () => ({ autoTitleSession: forbidden.autoTitleSession }));
vi.mock("@/lib/notes/repository", () => ({
  getPersonalNotes: async () => ({ content: "<p>my note</p>", revision: 1, updatedAt: null }),
  getEnhancedNotes: async () => ({
    content: "",
    revision: 0,
    status: "idle",
    error: null,
    generatedAt: null,
    editedAt: null,
    sourceNotesRevision: null,
    sourceTurnCount: null,
    updatedAt: null,
  }),
}));
vi.mock("@/lib/private-chat/repository", () => ({
  listPrivateChatMessages: async () => [
    { id: "m1", role: "user", text: "earlier", sequence: 1, createdAt: "" },
    { id: "m2", role: "assistant", text: "earlier answer", sequence: 2, createdAt: "" },
  ],
  appendPrivateChatMessage: async (_uid: string, _sid: string, input: Record<string, unknown>) => {
    chatWrites.push(input);
    return { id: `w${chatWrites.length}`, sequence: chatWrites.length, createdAt: "", ...input };
  },
}));
vi.mock("@/lib/plan/repository", () => ({ recordAsk: vi.fn(async () => undefined) }));

import { runPrivateChatPipeline } from "@/lib/private-chat/pipeline";

const session: SessionDoc = {
  id: "s1",
  title: "Kickoff",
  projectId: null,
  autoTitled: false,
  status: "active",
  speakerCount: 2,
  pinned: false,
  createdAt: "",
  updatedAt: "",
  endedAt: null,
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

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe("runPrivateChatPipeline", () => {
  beforeEach(() => {
    chatWrites.length = 0;
    agentCalls.length = 0;
    streamState.mode = "complete";
    for (const fn of Object.values(forbidden)) fn.mockClear();
  });

  it("streams a written answer and persists both halves to the chat collection only", async () => {
    const { textStream, done } = await runPrivateChatPipeline({
      uid: "u1",
      session,
      question: "what did I write?",
      env: {} as ServerEnv,
      signal: new AbortController().signal,
    });
    expect(await drain(textStream)).toBe("Private answer.");
    await done;

    expect(chatWrites).toEqual([
      { role: "user", text: "what did I write?" },
      { role: "assistant", text: "Private answer.", interrupted: false },
    ]);
    expect(forbidden.appendTurn).not.toHaveBeenCalled();
    expect(forbidden.maybeCompactSession).not.toHaveBeenCalled();
    expect(forbidden.storePrefetchedContext).not.toHaveBeenCalled();
    expect(forbidden.autoTitleSession).not.toHaveBeenCalled();
  });

  it("asks the agent for text, with the notes in context and the chat thread as history", async () => {
    const { textStream, done } = await runPrivateChatPipeline({
      uid: "u1",
      session,
      question: "q",
      env: {} as ServerEnv,
      signal: new AbortController().signal,
    });
    await drain(textStream);
    await done;
    const call = agentCalls[0];
    expect(call.delivery).toBe("text");
    expect(call.speakerAware).toBe(false);
    expect(String(call.stableContext)).toContain("my note");
    expect(String(call.stableContext)).toContain("Sam: hello");
    expect(call.history).toEqual([
      { role: "user", text: "earlier" },
      { role: "assistant", text: "earlier answer" },
    ]);
  });

  it("keeps a stopped answer as an interrupted chat message", async () => {
    streamState.mode = "abort";
    const controller = new AbortController();
    const { textStream, done } = await runPrivateChatPipeline({
      uid: "u1",
      session,
      question: "q",
      env: {} as ServerEnv,
      signal: controller.signal,
    });
    const reader = textStream.getReader();
    await reader.read();
    controller.abort();
    await reader.read().catch(() => undefined);
    await done;
    expect(chatWrites[1]).toEqual({ role: "assistant", text: "Partial", interrupted: true });
    expect(forbidden.appendTurn).not.toHaveBeenCalled();
  });
});
