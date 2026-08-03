import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/lib/env";
import type { SessionDoc } from "@/lib/sessions/types";

const sentPhrases = vi.hoisted(() => [] as string[]);
const httpTexts = vi.hoisted(() => [] as string[]);
const wsState = vi.hoisted(() => ({ fails: false }));
const agentState = vi.hoisted(() => ({ searches: false }));
const appendTurn = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("@/lib/aria/agent", () => ({
  resolveEffectiveAskModelOption: () => ({
    apiModelId: "claude-haiku-4-5",
    provider: "anthropic",
  }),
  runAriaAgentStream: async ({
    onToolEvent,
  }: {
    onToolEvent?: (event: { tool: string; phase: "started" | "completed" }) => void;
  }) =>
    new ReadableStream<string>({
      start(controller) {
        // Anthropic reports the search before it writes anything, and does so
        // while the pipeline is still wiring up its audio stream — the timing
        // the deferred hand-off has to survive.
        if (agentState.searches) {
          onToolEvent?.({ tool: "web_search", phase: "started" });
        }
        controller.enqueue("The answer is yes, but ");
        controller.enqueue("the reason matters. More detail follows.");
        controller.close();
      },
    }),
}));

vi.mock("@/lib/aria/context/build-context", () => ({
  buildContextBundle: async ({ question }: { question: string }) => ({
    messages: "context",
    history: [],
    question,
    tokenEstimate: 4,
    log: {},
  }),
}));

vi.mock("@/lib/aria/context/summarize", () => ({
  maybeCompactSession: async () => null,
}));

vi.mock("@/lib/audio/cartesia-ws", () => ({
  CARTESIA_PCM_ENCODING: "pcm_f32le",
  cartesiaPcmBytesPerSecond: (sampleRate: number) => sampleRate * 4,
  createCartesiaContextStream: async () => {
    if (wsState.fails) throw new Error("ws unavailable");
    let audioController:
      | ReadableStreamDefaultController<Uint8Array>
      | undefined;
    const audio = new ReadableStream<Uint8Array>({
      start(controller) {
        audioController = controller;
      },
    });
    return {
      contextId: "context",
      sampleRate: 48000,
      encoding: "pcm_f32le",
      audio,
      done: Promise.resolve(),
      sendText(text: string) {
        sentPhrases.push(text);
      },
      finish() {
        audioController?.enqueue(new Uint8Array([0, 0, 0, 0]));
        audioController?.close();
      },
      abort() {
        audioController?.close();
      },
    };
  },
}));

vi.mock("@/lib/audio/cartesia-tts", () => ({
  createCartesiaSpeechStream: async (
    _config: unknown,
    text: string
  ) => {
    httpTexts.push(text);
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
  },
}));
vi.mock("@/lib/composio/intent", () => ({
  resolveConnectorToolkits: () => [],
}));
vi.mock("@/lib/composio/tools-cache", () => ({
  loadComposioAgentTools: async () => ({
    tools: [],
    cache: "disabled",
    toolCount: 0,
  }),
}));
vi.mock("@/lib/sessions/repository", () => ({ appendTurn }));
vi.mock("@/lib/plan/repository", () => ({ recordAsk: vi.fn() }));
vi.mock("@/lib/server/context-dev-log", () => ({
  logAskComplete: vi.fn(),
}));
vi.mock("@/lib/server/ask-pipeline-log", () => ({
  setAskPipelineForComposio: vi.fn(),
  logAskTimingSummary: vi.fn(),
  startAskPipeline: () => pipeline,
}));
vi.mock("@/lib/aria/context/auto-title", () => ({
  autoTitleSession: vi.fn(),
}));

const pipeline = {
  sessionId: "session",
  turnId: "turn",
  startedAt: 0,
  stage: vi.fn(),
  elapsed: vi.fn(() => 0),
  finish: vi.fn(),
};

import { runAnswerPipeline, SEARCH_FILLER_PHRASES } from "./answer-pipeline";

const session: SessionDoc = {
  id: "session",
  title: "Session",
  projectId: null,
  autoTitled: false,
  status: "active",
  speakerCount: 1,
  pinned: false,
  createdAt: "",
  updatedAt: "",
  endedAt: null,
  trashedAt: null,
  lastSummaryAt: null,
  tokenEstimate: 0,
  searchableTextPreview: "",
  turnCount: 0,
  mode: "in_person",
  transcriptionMode: "basic",
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

describe("runAnswerPipeline voice streaming", () => {
  beforeEach(() => {
    sentPhrases.length = 0;
    httpTexts.length = 0;
    wsState.fails = false;
    agentState.searches = false;
    appendTurn.mockClear();
  });

  it("keeps one Cartesia context and streams word-aligned fragments", async () => {
    const result = await runAnswerPipeline({
      uid: "user",
      session,
      question: "Is that right?",
      env,
      signal: new AbortController().signal,
      pcmAudio: true,
      pcmSampleRate: 48000,
      pipeline,
    });

    const bytes = await new Response(result.audioStream).arrayBuffer();
    await result.done;

    expect(bytes.byteLength).toBe(4);
    // Word-level streaming: fragments reach Cartesia as soon as they clear the
    // minimum size (its continuation buffer joins them into natural phrases).
    // The full text must arrive intact and every fragment must end on a word
    // boundary — never mid-word.
    const fullText = sentPhrases.map((phrase) => phrase.trim()).join(" ");
    expect(fullText).toBe(
      "The answer is yes, but the reason matters. More detail follows."
    );
    expect(sentPhrases.length).toBeGreaterThan(1);
    for (const phrase of sentPhrases) {
      expect(phrase.trim().length).toBeGreaterThan(0);
    }
    expect(result.ttsTransport).toBe("cartesia-ws");
    expect(result.effectiveModel).toBe("claude-haiku-4-5");
    expect(appendTurn).toHaveBeenCalledWith(
      "user",
      "session",
      expect.objectContaining({ role: "assistant" })
    );
  });

  it("cancels generation without emitting late Cartesia phrases", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runAnswerPipeline({
      uid: "user",
      session,
      question: "Stop.",
      env,
      signal: controller.signal,
      pcmAudio: true,
      pipeline,
    });

    expect((await new Response(result.audioStream).arrayBuffer()).byteLength).toBe(
      0
    );
    await result.done;
    expect(sentPhrases).toEqual([]);
  });

  const persistedRole = (call: unknown): string | undefined =>
    ((call as unknown[])[2] as { role?: string } | undefined)?.role;
  const persistedText = (call: unknown): string | undefined =>
    ((call as unknown[])[2] as { text?: string } | undefined)?.text;
  const questionPersists = () =>
    appendTurn.mock.calls.filter(
      (call) => persistedRole(call) === "user_question"
    );
  const assistantPersists = () =>
    appendTurn.mock.calls.filter((call) => persistedRole(call) === "assistant");

  it("speculative: persists the question exactly once, when audio is produced", async () => {
    const result = await runAnswerPipeline({
      uid: "user",
      session,
      question: "Is that right?",
      env,
      signal: new AbortController().signal,
      pcmAudio: true,
      pcmSampleRate: 48000,
      pipeline,
      speculative: true,
    });

    await new Response(result.audioStream).arrayBuffer();
    await result.done;

    // Deferred to the first audio byte (answer committed to being heard) and
    // still written exactly once.
    expect(questionPersists()).toHaveLength(1);
    expect(assistantPersists()).toHaveLength(1);
  });

  it("speculative: a discard before any audio persists nothing", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runAnswerPipeline({
      uid: "user",
      session,
      question: "Is that right?",
      env,
      signal: controller.signal,
      pcmAudio: true,
      pipeline,
      speculative: true,
    });

    expect(
      (await new Response(result.audioStream).arrayBuffer()).byteLength
    ).toBe(0);
    await result.done;

    // The whole point of the deferral: an aborted speculation leaves no phantom
    // question and no empty answer in the transcript.
    expect(questionPersists()).toHaveLength(0);
    expect(assistantPersists()).toHaveLength(0);
  });

  it("non-speculative: persists the question when audio is produced", async () => {
    const result = await runAnswerPipeline({
      uid: "user",
      session,
      question: "Is that right?",
      env,
      signal: new AbortController().signal,
      pcmAudio: true,
      pcmSampleRate: 48000,
      pipeline,
    });

    await new Response(result.audioStream).arrayBuffer();
    await result.done;
    expect(questionPersists()).toHaveLength(1);
  });

  it("speaks a hand-off through the answer's own voice while a search runs", async () => {
    agentState.searches = true;
    const result = await runAnswerPipeline({
      uid: "user",
      session,
      question: "What happened in the market today?",
      env,
      signal: new AbortController().signal,
      pcmAudio: true,
      pcmSampleRate: 48000,
      pipeline,
    });

    await new Response(result.audioStream).arrayBuffer();
    await result.done;

    // Spoken first and through the same Cartesia context as the answer, so the
    // room hears one continuous voice rather than a clip spliced on the front.
    const [handOff, ...answerFragments] = sentPhrases.map((p) => p.trim());
    expect(SEARCH_FILLER_PHRASES).toContain(handOff);
    expect(answerFragments.join(" ")).toBe(
      "The answer is yes, but the reason matters. More detail follows."
    );

    // The hand-off is stagecraft, not part of the answer: persisting it would
    // feed "let me look that up" back as context on the next turn.
    expect(persistedText(assistantPersists()[0])).toBe(
      "The answer is yes, but the reason matters. More detail follows."
    );
  });

  it("stays silent about searching when no search runs", async () => {
    const result = await runAnswerPipeline({
      uid: "user",
      session,
      question: "What did we decide?",
      env,
      signal: new AbortController().signal,
      pcmAudio: true,
      pcmSampleRate: 48000,
      pipeline,
    });

    await new Response(result.audioStream).arrayBuffer();
    await result.done;

    for (const phrase of SEARCH_FILLER_PHRASES) {
      expect(sentPhrases.map((p) => p.trim())).not.toContain(phrase);
    }
  });

  it("streams per-sentence HTTP audio when the continuous WS fails", async () => {
    wsState.fails = true;
    const result = await runAnswerPipeline({
      uid: "user",
      session,
      question: "Is that right?",
      env,
      signal: new AbortController().signal,
      pcmAudio: true,
      pipeline,
    });

    // Two 3-byte segments: the fallback synthesizes each sentence as it lands
    // rather than buffering the whole answer, so speech starts on sentence one.
    expect((await new Response(result.audioStream).arrayBuffer()).byteLength).toBe(
      6
    );
    await result.done;
    expect(result.audioFormat).toBe("mp3");
    expect(result.ttsFallbackReason).toBe("ws unavailable");
    expect(httpTexts).toEqual([
      "The answer is yes, but the reason matters.",
      "More detail follows.",
    ]);
  });
});

