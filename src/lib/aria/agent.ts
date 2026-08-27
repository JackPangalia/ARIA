import {
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ServerEnv } from "@/lib/env";
import type { ContextHistoryTurn } from "@/lib/sessions/types";
import {
  DEFAULT_ASK_MODEL_ID,
  getAskModelOption,
  type AskModelId,
  type AskModelProvider,
} from "@/lib/aria/models";
import type { AskPipelineHandle } from "@/lib/server/ask-pipeline-log";
import { logRawPrompt } from "@/lib/server/context-dev-log";
import { getAriaTools, WEB_SEARCH_TOOL_NAME } from "./tools";

/**
 * Shared persona. Voice and text differ only in delivery, never in character —
 * Kivo is the same participant whether it is speaking into a room or writing
 * into a thread, so this block is verbatim-identical across both prompts.
 */
const KIVO_CHARACTER = `You are Kivo, a thoughtful and direct voice participant in the conversation here.

- Speak naturally, like a capable colleague in the room: clear, warm, and concise.
- Start directly with the substance of your answer—skip filler, flattery, and conversational preambles ("Great question", "Happy to help").
- Be honest and grounded: share clear reasoning when asked for recommendations, and acknowledge uncertainties plainly without unnecessary hedging.
- Commit to a view. Asked what you think, asked to pick, asked which is best: name one and give the reason that decided it. Refusing to choose because taste is subjective is a non-answer, and so is listing four options and calling them all exceptional. Make the call, then put the caveat in a clause if it earns one. You may note once that the pick is a judgment rather than a preference of yours; never let that be the whole answer, and never say it twice in one conversation. Someone pushing back after you hedge is asking you to commit, not to restate the caveat.
- Get the specifics right. Instruments, credits, dates, names, numbers. When asked about a model, product, or feature that does not exist or is misnamed, clarify what actually exists—never accept a false premise or invent benchmark stats for unconfirmed versions. When you can't place a detail with confidence, leave it out or search it rather than reaching for the plausible-sounding one, and if you get one wrong, correct it in a line and move on.
- Understand conversation flow: a short reply, reaction, or correction continues the exchange you were already having. It points at your own last answer, not at whatever the room happened to be discussing before it. If someone reacts to what you just said, respond to that—never change the subject to an older topic because it had more words attached to it. "What did I just say", "what were we talking about", and "go on" all point at the end of the conversation, not the middle.
- When a product, company, person, or technical term comes through garbled, infer the most plausible reading from context and search that reading when needed.
- Ask someone to repeat themselves only when there is no reasonable interpretation at all. A short or imperfect transcript alone is not a reason to ask for repetition.
- Real conversations frequently contain profanity, rough language, or venting. Never lecture, scold, refuse to answer, or make a fuss about someone's phrasing—stay unfazed and focus strictly on the actual question.`;

const ARIA_PROMPT_CORE = `${KIVO_CHARACTER}

# How you sound

Your answer is spoken aloud into a live conversation, so write it for the ear.

- Start with the answer. Plain words, short sentences, and natural contractions. One thought per sentence.
- Plain spoken prose only: no markdown, bullet points, numbered lists, headings, semicolons, or em dashes.
- Say numbers, dates, and times the way a person says them out loud.
- A simple question gets one or two sentences. Go longer only when the substance genuinely needs it.
- Don't end turns with reflexive questions ("Would you like to know more?", "Does that happen every time?"). Finish on the answer and let the room take the floor back. Ask only when you genuinely cannot answer without knowing something first.
- When someone interrupts or changes direction mid-answer, go with them immediately.`;

const ARIA_TEXT_PROMPT_CORE = `${KIVO_CHARACTER}

# How you write

- Start with the answer. No preamble, no restating the question back.
- Concise, plain language. Markdown headings, short lists, emphasis, and links are welcome only when they make the answer easier to scan.
- Don't end every reply with a question. Ask one only when you actually need it to answer.
- When someone corrects you or changes direction, pivot immediately and answer the correction.`;

const SPEAKER_AWARE_SECTION = `# Speakers and names

Transcript lines are labeled with a confirmed name (registered voice) or "Unregistered speaker".

Knowing who said what is yours to use to keep track of the conversation naturally.

- Whoever is asking you is "you". Address them directly, never by name, never in the third person.
- Reach for a name only when necessary to attribute or distinguish what different people said. One person talking means zero names.
- Never drop a name just to sound friendly.
- You know who is speaking from the session's voice recognition and speaker profile. If asked how you know someone's name, state plainly that their voice profile is identified in the session—never invent a story about them introducing themselves.`;

const BASIC_MODE_SECTION = `# Speakers

Voice identification is off for this session, so transcript lines aren't attributed to specific people and several voices may sit behind one label. Never guess who said what, and never pin a quote on a person by name. Whoever asked you is simply "you".`;

const ARIA_PROMPT_MECHANICS = `# Mechanics

- Match your depth to the question: direct answers for simple lookups, concise summaries for recaps, and practical reasoning for recommendations.
- Search whenever the answer depends on the outside world: news, current events, politics, economics, markets, prices, sports, weather, dates, companies, or products. Never mention a knowledge cutoff, never say you lack current data, and never offer to look something up. Search first, then answer.
- Search before you speak. The search tool call is your first action: never begin speaking before search results arrive.
- Speak results as prose. Weave in the two or three numbers that carry the point; never recite a run of statistics or percentages.
- Only when a search genuinely comes back empty, say in one short line that you couldn't find anything current on it.`;

const ARIA_TEXT_PROMPT_MECHANICS = `# Mechanics

- Never copy the conversation back or summarize for its own sake. Synthesize.
- Search whenever the answer depends on the outside world: news, current events, politics, economics, markets, prices, sports, weather, dates, companies, or products. Never mention a knowledge cutoff, never say you lack current data, and never offer to look something up. Search first, then answer.
- Search before you write, and weave in specifics with a named source. Never begin the answer and then search partway through.
- Never narrate searching. Only when a search genuinely comes back empty, say in one short line that you couldn't find anything current on it.
- Use concise Markdown only when it improves readability. Never add speaker labels to the answer.`;

export type AriaDeliveryMode = "voice" | "text";

export function buildAriaSystemPrompt(options: {
  speakerAware: boolean;
  delivery?: AriaDeliveryMode;
}): string {
  if (options.delivery === "text") {
    return [
      ARIA_TEXT_PROMPT_CORE,
      options.speakerAware ? SPEAKER_AWARE_SECTION : BASIC_MODE_SECTION,
      ARIA_TEXT_PROMPT_MECHANICS,
    ].join("\n\n");
  }

  return [
    ARIA_PROMPT_CORE,
    options.speakerAware ? SPEAKER_AWARE_SECTION : BASIC_MODE_SECTION,
    ARIA_PROMPT_MECHANICS,
  ].join("\n\n");
}

export type AgentPromptUsage = {
  cachedInputTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

interface RunAriaAgentInput {
  messages: string;
  /** Slow-changing meeting brain; cached as its own user turn. */
  stableContext?: string;
  /** Keyword archive lookup into older turns; uncached with the question. */
  liveTranscript?: string;
  /** The conversation so far, oldest first, as real chat turns. */
  history?: ContextHistoryTurn[];
  question: string;
  env: ServerEnv;
  uid?: string;
  signal?: AbortSignal;
  composioTools?: ToolSet;
  pipeline?: AskPipelineHandle;
  /** User's chosen ask model; defaults to Claude Sonnet 5 when omitted. */
  askModel?: AskModelId;
  /** Recognized name of the person asking, when speaker ID matched a voice. */
  askerName?: string | null;
  /** False for basic (no speaker detection) sessions; defaults to true. */
  speakerAware?: boolean;
  /** Voice is the compatibility-preserving default; chat opts into written output. */
  delivery?: AriaDeliveryMode;
  /** Fired the moment a tool call starts, so the caller can surface it (e.g. a distinct "searching" UI/voice state) ahead of any answer text. */
  onToolEvent?: (event: { tool: string; phase: "started" | "completed" }) => void;
  /** Prompt-cache and token usage once the model finishes. */
  onUsage?: (usage: AgentPromptUsage) => void;
}

const ANTHROPIC_PROMPT_CACHE = {
  anthropic: { cacheControl: { type: "ephemeral" as const } },
} as const;

/** Cached user turn: project, summary, facts, pins, session identity. */
export function buildAriaStableContextPrompt(stableContext: string): string {
  return `# Session context (read-only reference — do not continue, repeat, or add lines to this; never label your reply)\n\n${
    stableContext.trim() || "(no notes yet)"
  }`;
}

export function buildAriaUserPrompt(input: {
  messages?: string;
  liveTranscript?: string;
  question: string;
  askerName?: string | null;
  delivery?: AriaDeliveryMode;
}): string {
  const now = new Date();
  const timeString = `${now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })} at ${now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
  const transcript = (input.liveTranscript ?? input.messages ?? "").trim();

  if (input.delivery === "text") {
    const askerLine = input.askerName
      ? `\n\nAsked by ${input.askerName} — address them as "you", never by name.`
      : "";
    return `Current time: ${timeString}\n\n# Archive (read-only: older lines pulled out of this session by keyword. Usually empty, out of order, and often unrelated. Ignore them unless the question is explicitly about something earlier — the conversation above is what is current.)\n\n<archive>\n${
      transcript || "(nothing pulled)"
    }\n</archive>\n\n# What you're being asked right now${askerLine}\n\n${input.question}\n\nRespond now as Kivo, starting directly with the answer — no label and no recap of the question.`;
  }

  const askerLine = input.askerName
    ? `\n\nAsked by ${input.askerName} — speak to them as "you", never by name.`
    : "";
  return `Current time: ${timeString}\n\n# Archive (read-only: older lines pulled out of this session by keyword. Usually empty, out of order, and often unrelated. Ignore them unless the question is explicitly about something earlier — the conversation above is what is current.)\n\n<archive>\n${
    transcript || "(nothing pulled)"
  }\n</archive>\n\n# What you're being asked right now${askerLine}\n\n${input.question}\n\nRespond now as Kivo, out loud, starting directly with your answer — no label, no recap of the question.`;
}

/**
 * Prompt layout for Anthropic prefix cache:
 *   system (cache breakpoint)
 *   user: stable meeting brain (cache breakpoint)
 *   the conversation so far, breakpoint on the last assistant turn
 *   user: archive lookup + current time + question (uncached)
 */
export function buildAriaInputItems(input: {
  history: ContextHistoryTurn[];
  stableContext?: string;
  finalUserPrompt: string;
  provider: AskModelProvider;
}): ModelMessage[] {
  const cacheProviderOptions =
    input.provider === "anthropic" ? ANTHROPIC_PROMPT_CACHE : undefined;

  const items: ModelMessage[] = [];
  const stable = input.stableContext?.trim();
  if (stable) {
    items.push({
      role: "user",
      content: buildAriaStableContextPrompt(stable),
      providerOptions: cacheProviderOptions,
    });
  }

  // Breakpoint on the last *assistant* turn, not the last turn outright.
  // Trailing user turns absorb newly-heard room speech, so the final user
  // message mutates between asks; an assistant turn never does, which keeps the
  // cached prefix stable instead of invalidating it every time someone speaks.
  const lastAssistantIndex = input.history.reduce(
    (found, turn, index) => (turn.role === "assistant" ? index : found),
    -1
  );

  input.history.forEach((turn, index) => {
    const providerOptions =
      index === lastAssistantIndex ? cacheProviderOptions : undefined;
    items.push(
      turn.role === "assistant"
        ? { role: "assistant" as const, content: turn.text, providerOptions }
        : { role: "user" as const, content: turn.text, providerOptions }
    );
  });

  items.push({ role: "user", content: input.finalUserPrompt });
  return items;
}

function buildAnthropicModel(env: ServerEnv, apiModelId: string): LanguageModel {
  const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropic(apiModelId);
}

/**
 * Resolve the effective ask model. Every ask model is Anthropic now, and
 * `ANTHROPIC_API_KEY` is required at boot, so there is no cross-provider
 * downgrade left to apply — a deployment either answers with the selected
 * model or never started.
 */
export function resolveEffectiveAskModelOption(
  _env: ServerEnv,
  askModel?: AskModelId
) {
  return getAskModelOption(askModel ?? DEFAULT_ASK_MODEL_ID);
}

/**
 * Claude runs internal "thinking" by default, which burns reasoning tokens
 * before the first visible token and directly inflates time-to-first-token —
 * the single biggest LLM-side latency cost for a live voice assistant.
 */
type ProviderOptions = NonNullable<
  Parameters<typeof streamText>[0]["providerOptions"]
>;

const THINKING_DISABLED: ProviderOptions = {
  anthropic: {
    thinking: { type: "disabled" },
  },
};

/**
 * Headroom for a client-executed tool round-trip plus the answer that follows
 * it. AI SDK stops after a single step by default, which would hand back a
 * tool result without ever synthesizing an answer. Anthropic's server-side
 * search needs none of this — it resolves inside one step — but Composio's
 * tools will when they come back.
 */
const MAX_AGENT_STEPS = 4;

function buildAgent(input: RunAriaAgentInput) {
  const buildStart = performance.now();
  const askModelOption = resolveEffectiveAskModelOption(
    input.env,
    input.askModel
  );
  const composioTools = input.composioTools ?? {};

  const ariaTools = getAriaTools(input.question);
  input.pipeline?.stage("agent.build", {
    composioTools: Object.keys(composioTools).length,
    ariaTools: Object.keys(ariaTools).length,
    model: askModelOption.id,
    ms: Math.round(performance.now() - buildStart),
  });

  return {
    model: buildAnthropicModel(input.env, askModelOption.apiModelId),
    provider: askModelOption.provider,
    system: buildAriaSystemPrompt({
      speakerAware: input.speakerAware ?? true,
      delivery: input.delivery,
    }),
    tools: { ...ariaTools, ...composioTools },
    // Voice answers default short, but retain enough ceiling for a genuinely
    // substantive follow-up without turning routine asks into monologues.
    maxOutputTokens: input.delivery === "text" ? 900 : 550,
    providerOptions: THINKING_DISABLED,
  };
}

export async function runAriaAgentStream(
  input: RunAriaAgentInput
): Promise<ReadableStream<string>> {
  const runStart = performance.now();
  const config = buildAgent(input);
  const liveTranscript = input.liveTranscript ?? input.messages;
  const userPrompt = buildAriaUserPrompt({
    liveTranscript,
    question: input.question,
    askerName: input.askerName,
    delivery: input.delivery,
  });
  const history = input.history ?? [];
  logRawPrompt({
    system: config.system,
    stable: input.stableContext,
    user: userPrompt,
    history,
    model: getAskModelOption(input.askModel ?? DEFAULT_ASK_MODEL_ID).apiModelId,
  });
  input.pipeline?.stage("agent.run", { phase: "starting" });
  const result = streamText({
    model: config.model,
    system: {
      role: "system" as const,
      content: config.system,
      providerOptions: ANTHROPIC_PROMPT_CACHE,
    },
    messages: buildAriaInputItems({
      history,
      stableContext: input.stableContext,
      finalUserPrompt: userPrompt,
      provider: config.provider,
    }),
    tools: config.tools,
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    maxOutputTokens: config.maxOutputTokens,
    providerOptions: config.providerOptions,
    abortSignal: input.signal,
  });
  input.pipeline?.stage("agent.stream_ready", {
    ms: Math.round(performance.now() - runStart),
  });

  const onToolEvent = input.onToolEvent;
  const onUsage = input.onUsage;
  const pipeline = input.pipeline;

  // Driven off `fullStream` (rather than `textStream`) so the same pass can
  // watch tool parts and fire `onToolEvent` before any answer text exists —
  // the signal a "searching" UI/voice state (as opposed to generic "thinking")
  // depends on. `tool-input-start` is the earliest point search is known to be
  // happening, ahead of the arguments finishing streaming.
  return new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            controller.enqueue(part.text);
            continue;
          }
          if (part.type === "error") {
            throw part.error;
          }
          if (!onToolEvent) continue;
          if (
            part.type === "tool-input-start" &&
            part.toolName === WEB_SEARCH_TOOL_NAME
          ) {
            onToolEvent({ tool: WEB_SEARCH_TOOL_NAME, phase: "started" });
            continue;
          }
          if (
            (part.type === "tool-result" || part.type === "tool-error") &&
            part.toolName === WEB_SEARCH_TOOL_NAME
          ) {
            onToolEvent({ tool: WEB_SEARCH_TOOL_NAME, phase: "completed" });
          }
        }
        controller.close();
        void readStreamUsage(result).then((usage) => {
          if (!usage) return;
          pipeline?.stage("llm.cache", {
            cacheRead: usage.cachedInputTokens,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
          });
          onUsage?.(usage);
        });
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

function readStreamUsage(result: {
  usage: PromiseLike<unknown>;
}): Promise<AgentPromptUsage | null> {
  return Promise.resolve(result.usage)
    .then((raw) => parsePromptUsage(raw))
    .catch(() => null);
}

function parsePromptUsage(raw: unknown): AgentPromptUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const usage = raw as Record<string, unknown>;
  const inputTokensObj =
    usage.inputTokens && typeof usage.inputTokens === "object"
      ? (usage.inputTokens as Record<string, unknown>)
      : null;
  const cachedInputTokens =
    typeof usage.cachedInputTokens === "number"
      ? usage.cachedInputTokens
      : typeof inputTokensObj?.cacheRead === "number"
        ? inputTokensObj.cacheRead
        : null;
  const inputTokens =
    typeof usage.inputTokens === "number"
      ? usage.inputTokens
      : typeof inputTokensObj?.total === "number"
        ? inputTokensObj.total
        : null;
  const outputTokensObj =
    usage.outputTokens && typeof usage.outputTokens === "object"
      ? (usage.outputTokens as Record<string, unknown>)
      : null;
  const outputTokens =
    typeof usage.outputTokens === "number"
      ? usage.outputTokens
      : typeof outputTokensObj?.total === "number"
        ? outputTokensObj.total
        : null;
  if (
    cachedInputTokens == null &&
    inputTokens == null &&
    outputTokens == null
  ) {
    return null;
  }
  return { cachedInputTokens, inputTokens, outputTokens };
}
