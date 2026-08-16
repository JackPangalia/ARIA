import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test";
import { tool } from "ai";
import { z } from "zod";
import type { ServerEnv } from "@/lib/env";
import {
  ASK_MODELS,
  DEFAULT_ASK_MODEL_ID,
  parseAnswerModel,
} from "@/lib/aria/models";

const streamSteps = vi.hoisted(() => ({
  queue: [] as LanguageModelV3StreamPart[][],
}));

function finishPart(
  unified: LanguageModelV3FinishReason["unified"]
): LanguageModelV3StreamPart {
  return {
    type: "finish",
    finishReason: { unified, raw: unified },
    usage: {
      inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
  };
}

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => () =>
    new MockLanguageModelV3({
      doStream: async () => ({
        stream: convertArrayToReadableStream(
          streamSteps.queue.shift() ?? [
            { type: "stream-start", warnings: [] },
            finishPart("stop"),
          ]
        ),
      }),
    }),
}));

// Search runs inside Anthropic's turn; only its *name* on the stream parts
// matters to the contract under test here.
vi.mock("./tools", async () => {
  const actual = await vi.importActual<typeof import("./tools")>("./tools");
  return {
    ...actual,
    getAriaTools: () => ({
      [actual.WEB_SEARCH_TOOL_NAME]: tool({
        description: "stub",
        inputSchema: z.object({ query: z.string() }),
        execute: async () => "stub search result",
      }),
    }),
  };
});

const {
  buildAriaSystemPrompt,
  buildAriaUserPrompt,
  buildAriaStableContextPrompt,
  buildAriaInputItems,
  resolveEffectiveAskModelOption,
  runAriaAgentStream,
} = await import("./agent");
const { WEB_SEARCH_TOOL_NAME } = await import("./tools");

function env(anthropicKey = "test-anthropic-key"): ServerEnv {
  return {
    CARTESIA_API_KEY: "test",
    CARTESIA_MODEL_ID: "sonic-3",
    CARTESIA_VOICE_ID: "test",
    SPEECHMATICS_API_KEY: "test",
    SPEECHMATICS_RT_REGION: "us",
    RECALL_TRANSCRIPT_MODE: "low_latency",
    ANTHROPIC_API_KEY: anthropicKey,
  };
}

describe("voice agent configuration", () => {
  it("serves every ask model from Anthropic", () => {
    expect(ASK_MODELS.every((option) => option.provider === "anthropic")).toBe(
      true
    );
    expect(
      resolveEffectiveAskModelOption(env(), "claude-haiku-4-5").apiModelId
    ).toBe("claude-haiku-4-5");
    expect(
      resolveEffectiveAskModelOption(env(), "claude-sonnet-5").apiModelId
    ).toBe("claude-sonnet-5");
  });

  it("reads a retired gemini answer-model preference as the default", () => {
    // Selectable before the Anthropic consolidation, so it can still be
    // persisted in users/{uid}/private/plan.
    expect(parseAnswerModel("gemini-2.5-flash")).toBe(DEFAULT_ASK_MODEL_ID);
    expect(parseAnswerModel(undefined)).toBe(DEFAULT_ASK_MODEL_ID);
    expect(parseAnswerModel("claude-sonnet-5")).toBe("claude-sonnet-5");
  });

  it("keeps one brief clarification available when a material detail is missing", () => {
    const prompt = buildAriaSystemPrompt({ speakerAware: false });
    expect(prompt).toContain("calm, incisive, low-ego, and intellectually rigorous");
    expect(prompt).toContain("Match your response to what is actually being asked");
    expect(prompt).toContain("Critically process pushback");
    expect(prompt).toContain("Never say \"it depends\"");
    expect(prompt.length).toBeLessThan(6_000);
  });

  /**
   * Kivo once answered "I don't have live data on current events past my
   * knowledge cutoff" — a near-verbatim readback of a prompt line that offered
   * declining as an option. Search is attached to every ask, so the prompt must
   * never hand the model a way out of using it.
   */
  it("offers no way to decline searching", () => {
    for (const delivery of ["voice", "text"] as const) {
      const prompt = buildAriaSystemPrompt({ speakerAware: false, delivery });
      expect(prompt).not.toMatch(/state clearly that you don't have live data/i);
      expect(prompt).not.toMatch(/if search is (unavailable|inconclusive)/i);
      expect(prompt).toContain("Never mention a knowledge cutoff");
      expect(prompt).toMatch(/[Ss]earch before you (speak|write)/);
    }
  });

  it("keeps omitted delivery exactly equivalent to explicit voice delivery", () => {
    const systemOptions = { speakerAware: true };
    const userInput = {
      messages: "Speaker: We should ship Friday.",
      question: "When are we shipping?",
      askerName: "Ari",
    };

    expect(buildAriaSystemPrompt(systemOptions)).toBe(
      buildAriaSystemPrompt({ ...systemOptions, delivery: "voice" })
    );
    expect(buildAriaUserPrompt(userInput)).toBe(
      buildAriaUserPrompt({ ...userInput, delivery: "voice" })
    );
    expect(buildAriaUserPrompt(userInput)).toContain(
      "Respond now as Kivo, out loud"
    );
    expect(buildAriaUserPrompt(userInput)).toContain("Current time:");
  });
});

describe("Anthropic prompt cache layout", () => {
  it("keeps updatedAt and the live question out of the cached stable block", () => {
    const stable = buildAriaStableContextPrompt(
      "# Session\nTitle: Planning\nStatus: active"
    );
    expect(stable).toContain("# Session");
    expect(stable).not.toContain("Updated:");
    expect(stable).not.toContain("Current time:");
    expect(stable).not.toContain("What you're being asked");
  });

  it("puts the question and current time only on the uncached live prompt", () => {
    const live = buildAriaUserPrompt({
      liveTranscript: "# Recent room transcript\nSpeaker: ship Friday",
      question: "When are we shipping?",
    });
    expect(live).toContain("When are we shipping?");
    expect(live).toContain("Current time:");
    expect(live).toContain("ship Friday");
  });

  it("marks cache on stable context and last history, not on the final question", () => {
    const items = buildAriaInputItems({
      stableContext: "# Session\nTitle: Planning",
      history: [
        { role: "user", text: "first ask" },
        { role: "assistant", text: "first answer" },
      ],
      finalUserPrompt: "Current time: now\n\nWhen are we shipping?",
      provider: "anthropic",
    });

    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      role: "user",
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    });
    expect(String(items[0].content)).toContain("Title: Planning");
    expect(items[1]).toMatchObject({ role: "user", content: "first ask" });
    expect(items[1].providerOptions).toBeUndefined();
    expect(items[2]).toMatchObject({
      role: "assistant",
      content: "first answer",
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    });
    expect(items[3]).toMatchObject({
      role: "user",
      content: "Current time: now\n\nWhen are we shipping?",
    });
    expect(items[3].providerOptions).toBeUndefined();
  });
});

/**
 * The stream contract two callers depend on (answer-pipeline, chat-pipeline):
 * text deltas only, `onToolEvent` for search fired before any answer text, and
 * model errors surfaced through the stream. It has to survive the provider
 * swap underneath it, so it is pinned here rather than inferred from timings.
 */
describe("runAriaAgentStream contract", () => {
  beforeEach(() => {
    streamSteps.queue = [];
  });

  async function drain(stream: ReadableStream<string>): Promise<string[]> {
    const chunks: string[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return chunks;
  }

  function textStep(...deltas: string[]): LanguageModelV3StreamPart[] {
    return [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t1" },
      ...deltas.map((delta) => ({ type: "text-delta" as const, id: "t1", delta })),
      { type: "text-end", id: "t1" },
      finishPart("stop"),
    ];
  }

  it("emits text deltas only, in order", async () => {
    streamSteps.queue = [textStep("Paris", " is", " the capital.")];

    const chunks = await drain(
      await runAriaAgentStream({
        messages: "",
        question: "What is the capital of France?",
        env: env("test-anthropic-key"),
      })
    );

    expect(chunks).toEqual(["Paris", " is", " the capital."]);
  });

  it("signals search started before any answer text, then completed", async () => {
    streamSteps.queue = [
      [
        { type: "stream-start", warnings: [] },
        { type: "tool-input-start", id: "c1", toolName: WEB_SEARCH_TOOL_NAME },
        { type: "tool-input-delta", id: "c1", delta: '{"query":"kivo"}' },
        { type: "tool-input-end", id: "c1" },
        {
          type: "tool-call",
          toolCallId: "c1",
          toolName: WEB_SEARCH_TOOL_NAME,
          input: '{"query":"kivo"}',
        },
        finishPart("tool-calls"),
      ],
      textStep("Here", " you go."),
    ];

    const events: string[] = [];
    const chunks = await drain(
      await runAriaAgentStream({
        messages: "",
        question: "What shipped this week?",
        env: env("test-anthropic-key"),
        onToolEvent: ({ tool: name, phase }) => events.push(`${name}:${phase}`),
      })
    );

    expect(events).toEqual([
      `${WEB_SEARCH_TOOL_NAME}:started`,
      `${WEB_SEARCH_TOOL_NAME}:completed`,
    ]);
    expect(chunks.join("")).toBe("Here you go.");
  });

  it("signals search when Anthropic runs it server-side", async () => {
    // Native web_search never yields a client-executed tool call: the provider
    // reports it as already executed inside the same assistant turn.
    streamSteps.queue = [
      [
        { type: "stream-start", warnings: [] },
        {
          type: "tool-input-start",
          id: "s1",
          toolName: WEB_SEARCH_TOOL_NAME,
          providerExecuted: true,
        },
        { type: "tool-input-end", id: "s1" },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "Three launched." },
        { type: "text-end", id: "t1" },
        finishPart("stop"),
      ],
    ];

    const events: string[] = [];
    const chunks = await drain(
      await runAriaAgentStream({
        messages: "",
        question: "What launched today?",
        env: env(),
        onToolEvent: ({ tool: name, phase }) => events.push(`${name}:${phase}`),
      })
    );

    expect(events[0]).toBe(`${WEB_SEARCH_TOOL_NAME}:started`);
    expect(chunks.join("")).toBe("Three launched.");
  });

  it("surfaces model errors through the stream", async () => {
    streamSteps.queue = [
      [
        { type: "stream-start", warnings: [] },
        { type: "error", error: new Error("upstream exploded") },
      ],
    ];

    await expect(
      drain(
        await runAriaAgentStream({
          messages: "",
          question: "anything",
          env: env("test-anthropic-key"),
        })
      )
    ).rejects.toThrow("upstream exploded");
  });
});

describe("text agent configuration", () => {
  it("permits concise Markdown without voice delivery instructions", () => {
    const system = buildAriaSystemPrompt({
      speakerAware: false,
      delivery: "text",
    });
    const userPrompt = buildAriaUserPrompt({
      messages: "Speaker: We should ship Friday.",
      question: "When are we shipping?",
      delivery: "text",
    });

    expect(system).toContain("Use concise Markdown");
    expect(system).not.toMatch(/spoken aloud|plain spoken prose/i);
    expect(userPrompt).toContain("starting directly with the answer");
    expect(userPrompt).not.toContain("out loud");
  });
});

