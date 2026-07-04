import { Agent, Runner, type Tool } from "@openai/agents";
import { aisdk } from "@openai/agents-extensions/ai-sdk";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ServerEnv } from "@/lib/env";
import {
  DEFAULT_ASK_MODEL_ID,
  getAskModelOption,
  resolveModelId,
  type AskModelId,
} from "@/lib/aria/models";
import type { AskPipelineHandle } from "@/lib/server/ask-pipeline-log";
import { logRawPrompt } from "@/lib/server/context-dev-log";
import { getAriaTools } from "./tools";

export const ARIA_SYSTEM_PROMPT = `You are Kivo — a sharp, warm, genuinely curious person sitting in on this conversation. You've heard everything said so far. You stay quiet until someone brings you in, and when they do, you talk the way a smart, direct friend in the room would — never like a report, a coach, or a customer-service bot.

# The transcript is reference material, not a script to continue

You'll be given a block of prior conversation formatted as lines like "Jack: ..." or "Kivo: ...". This is READ-ONLY CONTEXT — never something you continue, repeat, or add new lines to. You are not writing dialogue for Jack, for "Unregistered speaker," or for a past version of yourself.

Never do any of the following:
- Start your reply with a name, role, or label followed by a colon.
- Invent or restate a line as if someone else just said it.
- Repeat back verbatim something already said earlier in the transcript.
- Quote the question back before answering it ("So the question is...", "It sounds like you're asking...").

Output is exactly and only the words you'd say out loud, starting directly with your answer. Nothing before it, nothing wrapping it.

# How you engage

When something's vague, take your best read of what they mean and answer it like you believe it — don't ask a clarifying question unless you genuinely cannot proceed at all without one. If you do ask and they clarify or correct you, treat it as resolved: answer the actual question on your next turn. Don't re-litigate what confused you, don't explain why you were confused, don't ask a second clarifying question about the clarification.

Bad (asks instead of committing): "I need more context — are you asking about X or Y? Those are very different things."
Good (commits to the likelier read): just answer for the reading that actually makes sense given everything said so far, and only flag the assumption in passing if it matters.

Never end your answer with a question of your own — no "does that help?", no "what's your actual use case?", no manufactured next step. Say your piece and stop; most of the time the answer is just the answer.

When asked to judge or compare things, actually pick one and say why in a sentence or two. Don't hedge with a pros-and-cons list for each option — that's a brochure, not a friend's opinion.

Bad (hedges everything): "X is stronger at reasoning, Y is faster and more current — depends what you need."
Good (commits): "X, honestly — it reasons through it better, and that matters more here than speed."

Match the moment: a quick question gets one or two sentences, a real question gets whatever length it actually takes — never pad, never clip a real thought short. Have an actual point of view and commit to it, but drop it the moment someone gives you a real reason to. Push back when something's off, directly but never cutting. Never narrate your own reasoning or apologize for a prior mix-up ("I completely missed the plot," "which felt like a legitimate gap to close") — just answer like the last exchange never needed a debrief.

Ground everything in what was actually said — names, specific arguments, contradictions if there are any. An answer that could've come from someone who wasn't in the room has missed the point of you.

# Reading the speakers

Speakers with a confirmed name (registered voice) are labeled by that name. Everyone else is "Unregistered speaker" — could be a real participant who hasn't registered their voice, or could be background noise. Judge from context: a coherent, engaged voice is a participant; a stray out-of-context line probably isn't.

# Mechanics

- Never read the conversation back or summarize for its own sake. Synthesize.
- Use Google Search only when you genuinely need to look something up — current facts, news, markets, weather, dates, or when explicitly asked. Weave in specifics and name a source. Don't search for opinions you can form from the room, small talk, or recap-only questions.
- You may have access to connected apps (e.g. Notion) via additional tools. Use them only when explicitly asked to read from or write to a connected app, then briefly confirm what you did.
- Plain spoken prose only. No markdown, no bullet points, no headings, no speaker labels of any kind.`;

interface RunAriaAgentInput {
  messages: string;
  question: string;
  env: ServerEnv;
  uid?: string;
  signal?: AbortSignal;
  composioTools?: Tool[];
  pipeline?: AskPipelineHandle;
  /** User's chosen ask model; defaults to Gemini 2.5 Flash when omitted. */
  askModel?: AskModelId;
}

export function buildAriaUserPrompt(input: {
  messages: string;
  question: string;
}): string {
  return `# Transcript so far (read-only reference — do not continue, repeat, or add lines to this; never label your reply)\n\n<transcript>\n${
    input.messages || "(no messages yet)"
  }\n</transcript>\n\n# What you're being asked right now\n\n${input.question}\n\nRespond now as Kivo, out loud, starting directly with your answer — no label, no recap of the question.`;
}

function buildGeminiModel(env: ServerEnv, apiModelId: string) {
  const google = createGoogleGenerativeAI({ apiKey: env.geminiApiKey });
  return aisdk(google(apiModelId));
}

function buildAnthropicModel(env: ServerEnv, apiModelId: string) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      `Missing ANTHROPIC_API_KEY — required to use ${apiModelId} as the ask model.`
    );
  }
  const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return aisdk(anthropic(apiModelId));
}

/**
 * Both Gemini 2.5 Flash and Claude Sonnet 5 run internal "thinking" by default,
 * which burns reasoning tokens before the first visible token and directly
 * inflates time-to-first-token — the single biggest LLM-side latency cost for a
 * live voice assistant. Disable it on whichever provider is active. The aisdk
 * wrapper spreads `modelSettings.providerData` straight into the underlying
 * LanguageModel request, so this maps to providerOptions.<provider>.
 */
function thinkingDisabledSettings(provider: "google" | "anthropic") {
  if (provider === "google") {
    return {
      google: {
        thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
      },
    };
  }
  return {
    anthropic: {
      thinking: { type: "disabled" },
    },
  };
}

async function buildAgent(input: RunAriaAgentInput): Promise<Agent> {
  const buildStart = performance.now();
  // The internal web-search subroutine (tools.ts) always runs on Gemini
  // regardless of the chosen ask model — it's a research tool call, not the
  // user-facing voice, so it doesn't need to match the answer model's provider.
  const searchModelId = resolveModelId(input.env);
  const askModelOption = getAskModelOption(input.askModel ?? DEFAULT_ASK_MODEL_ID);
  const composioTools = input.composioTools ?? [];

  const ariaTools = getAriaTools(input.question, searchModelId, {
    meetingSnippet: input.messages,
  });
  input.pipeline?.stage("agent.build", {
    composioTools: composioTools.length,
    ariaTools: ariaTools.length,
    model: askModelOption.id,
    ms: Math.round(performance.now() - buildStart),
  });

  const model =
    askModelOption.provider === "google"
      ? buildGeminiModel(input.env, askModelOption.apiModelId)
      : buildAnthropicModel(input.env, askModelOption.apiModelId);

  return new Agent({
    name: "Kivo",
    instructions: ARIA_SYSTEM_PROMPT,
    model,
    modelSettings: {
      // Kivo's answers are a handful of spoken sentences, never a document — cap
      // output generously above that instead of relying on provider defaults
      // (Anthropic defaults to a very large max_tokens, e.g. 64000, when unset).
      maxTokens: 2000,
      providerData: {
        providerOptions: thinkingDisabledSettings(askModelOption.provider),
      },
    },
    tools: [...ariaTools, ...composioTools],
  });
}

function buildRunner(): Runner {
  return new Runner({
    tracingDisabled: true,
  });
}

export async function runAriaAgent(input: RunAriaAgentInput): Promise<string> {
  const agent = await buildAgent(input);
  const userPrompt = buildAriaUserPrompt(input);
  logRawPrompt({
    system: ARIA_SYSTEM_PROMPT,
    user: userPrompt,
    model: getAskModelOption(input.askModel ?? DEFAULT_ASK_MODEL_ID).apiModelId,
  });
  const result = await buildRunner().run(
    agent,
    userPrompt,
    { signal: input.signal }
  );

  const text = result.finalOutput?.trim();
  if (!text) {
    throw new Error("Kivo returned an empty answer");
  }

  return text;
}

export async function runAriaAgentStream(
  input: RunAriaAgentInput
): Promise<ReadableStream<string>> {
  const runStart = performance.now();
  const agent = await buildAgent(input);
  const userPrompt = buildAriaUserPrompt(input);
  logRawPrompt({
    system: ARIA_SYSTEM_PROMPT,
    user: userPrompt,
    model: getAskModelOption(input.askModel ?? DEFAULT_ASK_MODEL_ID).apiModelId,
  });
  input.pipeline?.stage("agent.run", { phase: "starting" });
  const result = await buildRunner().run(
    agent,
    userPrompt,
    { stream: true, signal: input.signal }
  );
  input.pipeline?.stage("agent.stream_ready", {
    ms: Math.round(performance.now() - runStart),
  });

  return result.toTextStream() as unknown as ReadableStream<string>;
}
