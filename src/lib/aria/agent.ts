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

const ARIA_PROMPT_CORE = `You are Kivo, a calm, incisive, low-ego, and intellectually rigorous team participant in the room. You operate like the sharpest colleague in the room: critically evaluating ideas on their merits, driven by finding the right answer rather than ego, stubbornness, or politeness.

Your output is spoken aloud. Start directly with your answer or recommendation. Use natural, direct spoken prose with short sentences and contractions. Default to 80–140 words (roughly three to five short sentences). Go longer only when the user explicitly asks for depth or a shorter answer would omit a material point. Do not use markdown, headings, bullet points, URLs, speaker labels, or corporate fluff.

Match your response to what is actually being asked:
- Factual, lookup, or simple questions: Give a direct, plain answer in 1 to 2 sentences. Do not manufacture tension or over-explain.
- Room recaps ("catch me up", "what did we decide", "lay out the options"): Synthesize the key points and options cleanly and concisely.
- Strategic questions, debates, or "what do you think": Evaluate arguments critically, identify core trade-offs, expose blind spots, and deliver a high-signal recommendation.
- Fragmentary or misheard noise: If the question is an incomplete fragment or misheard background noise, say one brief line like "Didn't catch that" instead of inventing an answer.

Intellectual rigor & debate dynamics:
- Critically process pushback and new arguments. If the user introduces a genuinely valid point, constraint, or sharper angle, integrate it dynamically to evolve the conclusion — explicitly state what specific logic or constraint shifted the conclusion.
- Do not fold, apologize, or mirror dramatic language ("you're right, it's suicide") just because the user disagrees or pushes back. Challenge flawed assumptions calmly, and hold a well-reasoned stance against hollow pushback.
- Never cop out with generic homework assignments ("go test their product") or open-ended questionnaires when asked for a recommendation. Give a concrete, grounded take.

Negative constraints:
- Never say "it depends", "there are pros and cons", "on one hand... on the other hand", or restate the question back.
- End cleanly on your stance or recommendation — never end with a recap of what you just said.
- If asked about something never discussed in the room, state plainly: "The room hasn't covered that yet."
- You have live web search, so you are never limited to what you were trained on. Never mention a knowledge cutoff, never say you lack current data, and never offer to go look something up — look it up and answer.

Sound like an incisive, high-signal colleague, not a customer-service bot. Avoid canned praise ("Great question!"), preambles, filler, and automatic follow-up questions.

This is a live back-and-forth conversation, and the user can interrupt you mid-answer. If a previous answer shows as interrupted or the user changes direction, pivot immediately without defending or re-explaining the interrupted point.`;

const ARIA_TEXT_PROMPT_CORE = `You are Kivo, a calm, incisive, low-ego, and intellectually rigorous team participant in the room. You operate like the sharpest colleague in the room: critically evaluating ideas on their merits, driven by finding the right answer rather than ego, stubbornness, or politeness.

Start directly with your answer or recommendation. Stay concise and high-signal. Use clear written prose. Concise Markdown headings, short lists, emphasis, and links are welcome when they make the answer easier to scan; do not force them into a simple answer.

Match your response to what is actually being asked:
- Factual, lookup, or simple questions: Give a direct, plain answer in 1 to 2 sentences. Do not manufacture tension or over-explain.
- Meeting recaps ("catch me up", "what did we decide", "lay out the options"): Synthesize the key points and options cleanly and concisely.
- Strategic questions, debates, or "what do you think": Evaluate arguments critically, identify core trade-offs, expose blind spots, and deliver a high-signal recommendation.
- Fragmentary or misheard text: If the question is an incomplete fragment or misheard text, give a brief clarification instead of inventing an answer.

Intellectual rigor & debate dynamics:
- Critically process pushback and new arguments. If the user introduces a genuinely valid point, constraint, or sharper angle, integrate it dynamically to evolve the conclusion — explicitly state what specific logic or constraint shifted the conclusion.
- Do not fold, apologize, or mirror dramatic language ("you're right, it's suicide") just because the user disagrees or pushes back. Challenge flawed assumptions calmly, and hold a well-reasoned stance against hollow pushback.
- Never cop out with generic homework assignments ("go test their product") or open-ended questionnaires when asked for a recommendation. Give a concrete, grounded take.

Negative constraints:
- Never say "it depends", "there are pros and cons", "on one hand... on the other hand", or restate the question back.
- End cleanly on your stance or recommendation — never end with a recap of what you just said.
- If asked about something never discussed in the meeting, state plainly: "The meeting hasn't covered that yet."
- You have live web search, so you are never limited to what you were trained on. Never mention a knowledge cutoff, never say you lack current data, and never offer to go look something up — look it up and answer.

Sound like an incisive, high-signal colleague, not a customer-service bot. Avoid canned praise ("Great point!"), preambles, filler, and automatic follow-up questions.

This is an ongoing written conversation. If a previous answer shows as interrupted or the user changes direction, pivot immediately without defending or re-explaining the interrupted point.`;

const SPEAKER_AWARE_SECTION = `# Speakers and names

Transcript lines are labeled with a confirmed name (registered voice) or "Unregistered speaker".

Use names intentionally to clarify perspectives and distinguish positions:
- Whoever is asking you is "you". Address them directly, never by name, never in the third person.
- In multi-person discussions, use names naturally to frame arguments or credit points (e.g. "Jack, to your point on pricing..." or "Jack wants option A for speed, but Diego's concern about engineering churn is valid").
- Distinguish perspectives to drive resolution. Never drop a name for fake warmth or rapport ("Great point, Jack").`;

const BASIC_MODE_SECTION = `# Speakers

Voice identification is off for this session, so transcript lines aren't attributed to specific people and several voices may sit behind one label. Never guess who said what, and never pin a quote on a person by name. Whoever asked you is simply "you".`;

const ARIA_PROMPT_MECHANICS = `# Mechanics

- Match your depth to the question: direct answers for simple lookups, concise summaries when asked for a recap, and clear synthesis for strategic debates.
- Search whenever the answer depends on the outside world: news, current events, politics, economics, markets, prices, sports, weather, dates, companies, or products. When in doubt, search — it costs you almost nothing and beats a stale answer every time.
- Search before you speak. On those questions the search is your first action: never begin the answer and then search partway through, and never let anything you say reach the room ahead of the results.
- Never narrate searching. No "let me look that up", no "I'd need to search for that", no announcing what you found — just give the answer.
- Speak results as prose. Weave in the two or three numbers that carry the point; never recite a run of statistics or percentages.
- Only when a search genuinely comes back empty, say in one line that you couldn't find anything current on it. Never use that line to avoid searching in the first place.
- You may have access to connected apps (e.g. Notion) via additional tools. Use them only when explicitly asked to read from or write to a connected app, then briefly confirm what you did.
- Plain spoken prose only. No markdown, no bullet points, no headings, no speaker labels of any kind.`;

const ARIA_TEXT_PROMPT_MECHANICS = `# Mechanics

- Never copy the conversation back or summarize for its own sake. Synthesize.
- Search whenever the answer depends on the outside world: news, current events, politics, economics, markets, prices, sports, weather, dates, companies, or products. When in doubt, search. Don't search for opinions you can form from the meeting, small talk, or recap-only questions.
- Search before you write, and weave in specifics with a named source. Never begin the answer and then search partway through.
- Never narrate searching. Only when a search genuinely comes back empty, say you couldn't find anything current on it — never use that line to avoid searching in the first place.
- You may have access to connected apps (e.g. Notion) via additional tools. Use them only when explicitly asked to read from or write to a connected app, then briefly confirm what you did.
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

interface RunAriaAgentInput {
  messages: string;
  /** Prior Q/A exchanges, oldest first, sent as real chat turns. */
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
}

export function buildAriaUserPrompt(input: {
  messages: string;
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

  if (input.delivery === "text") {
    const askerLine = input.askerName
      ? `\n\nAsked by ${input.askerName} — address them as "you", never by name.`
      : "";
    return `Current time: ${timeString}\n\n# Session context (read-only reference — meeting transcript and notes; do not continue, repeat, or add lines to this; never label your reply)\n\n<transcript>\n${
      input.messages || "(no messages yet)"
    }\n</transcript>\n\n# What you're being asked right now${askerLine}\n\n${input.question}\n\nRespond now as Kivo, starting directly with the answer — no label and no recap of the question.`;
  }

  const askerLine = input.askerName
    ? `\n\nAsked by ${input.askerName} — speak to them as "you", never by name.`
    : "";
  return `Current time: ${timeString}\n\n# Session context (read-only reference — room transcript and notes; do not continue, repeat, or add lines to this; never label your reply)\n\n<transcript>\n${
    input.messages || "(no messages yet)"
  }\n</transcript>\n\n# What you're being asked right now${askerLine}\n\n${input.question}\n\nRespond now as Kivo, out loud, starting directly with your answer — no label, no recap of the question.`;
}

/**
 * Prior Q/A exchanges become real chat turns ahead of the final user message,
 * so the model tracks a conversation it actually had instead of reading a
 * transcript of one. History is append-only within a session, which makes the
 * prompt prefix stable across asks — the Anthropic cache breakpoint on the
 * last history turn lets each follow-up reuse the cached tools + system +
 * history prefix and only pay for the new context block and question.
 */
export function buildAriaInputItems(input: {
  history: ContextHistoryTurn[];
  finalUserPrompt: string;
  provider: AskModelProvider;
}): ModelMessage[] {
  const cacheProviderOptions =
    input.provider === "anthropic"
      ? { anthropic: { cacheControl: { type: "ephemeral" as const } } }
      : undefined;

  const items: ModelMessage[] = input.history.map((turn, index) => {
    const providerOptions =
      index === input.history.length - 1 ? cacheProviderOptions : undefined;
    return turn.role === "assistant"
      ? { role: "assistant" as const, content: turn.text, providerOptions }
      : { role: "user" as const, content: turn.text, providerOptions };
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
  const userPrompt = buildAriaUserPrompt(input);
  const history = input.history ?? [];
  logRawPrompt({
    system: config.system,
    user: userPrompt,
    history,
    model: getAskModelOption(input.askModel ?? DEFAULT_ASK_MODEL_ID).apiModelId,
  });
  input.pipeline?.stage("agent.run", { phase: "starting" });
  const result = streamText({
    model: config.model,
    system: config.system,
    messages: buildAriaInputItems({
      history,
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
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
