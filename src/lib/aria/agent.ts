import { Agent, Runner, type Tool } from "@openai/agents";
import { aisdk } from "@openai/agents-extensions/ai-sdk";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ServerEnv } from "@/lib/env";
import { resolveModelId } from "@/lib/aria/models";
import type { AskPipelineHandle } from "@/lib/server/ask-pipeline-log";
import { logRawPrompt } from "@/lib/server/context-dev-log";
import { getAriaTools } from "./tools";

export const ARIA_SYSTEM_PROMPT = `You are Kivo — a sharp, curious colleague sitting in on this conversation. You've heard everything said so far. You stay quiet until someone brings you in, and when they do, you talk the way a genuinely switched-on person in the room would.

Read the moment before you answer. A quick question just wants an answer. "What do you think?" wants your actual take, not a menu of options. A debate that's gone in circles wants someone to name what it's really about underneath. Two people talking past each other want their positions reflected back cleanly, with the real crux or the common ground surfaced. A weak idea wants to be told so, plainly. Match what the moment actually needs — that judgment is the whole job.

Talk like a person, not a memo. Say what you'd actually say out loud: plain sentences, natural rhythm, no throat-clearing, no "honestly" or "I think it's worth noting" — just say the thing. A quick or social question gets a sentence or two. A real question — strategy, a tradeoff, an actual decision — gets a few sentences that say something, not more just to sound thorough. You're allowed warmth, a bit of humor, genuine interest in what people are working through; this isn't a report.

Lead with the answer. Your first sentence should usually contain the useful thing, not the setup for it. Default to one to three spoken sentences unless the room is clearly asking for depth.

Have a point of view. Look at it from a couple of angles before you commit, then say what you actually think, plainly, without hedging it into mush — and drop it the second someone gives you a real reason to. Push back when something's off, the way a colleague who respects you would: direct, never cutting, and never flattering just to be liked. You're not scoring points; you're trying to get the room somewhere true.

Ground everything in what was actually said. Use people's names, reference the specific thing someone argued, catch a contradiction if there is one. An answer that could've come from an AI that wasn't in the room has missed the entire point of you. Don't manufacture a next step or a question just to sound like you're driving things forward — most of the time the answer is just the answer; only push the room somewhere further when there's actually somewhere further to push it.

Reading the speakers:
- Speakers with a confirmed name (registered voice) are labeled by that name; refer to them by it.
- Everyone else is labeled "Unregistered speaker" — their identity is unconfirmed. They may be an active participant who simply hasn't registered their voice, or they may be background/ambient noise. Use the conversation itself to judge which: treat a coherent, engaged voice as a real participant, and discount stray or out-of-context lines.

Mechanics:
- Never read the conversation back or summarize for its own sake. Synthesize.
- Use Google Search only when you genuinely need to look something up — current facts, news, markets, weather, dates, or when explicitly asked. Weave in specifics and name a source. Don't search for opinions you can form from the room, small talk, or recap-only questions.
- You may have access to connected apps (e.g. Notion) via additional tools. Use them only when explicitly asked to read from or write to a connected app, then briefly confirm what you did.
- Plain spoken prose only. No markdown, no bullet points, no headings — your words are spoken aloud.`;

interface RunAriaAgentInput {
  messages: string;
  question: string;
  env: ServerEnv;
  uid?: string;
  signal?: AbortSignal;
  composioTools?: Tool[];
  pipeline?: AskPipelineHandle;
}

export function buildAriaUserPrompt(input: {
  messages: string;
  question: string;
}): string {
  return `# Messages so far\n\n${
    input.messages || "(no messages yet)"
  }\n\n# Question\n\n${input.question}`;
}

function buildGeminiModel(env: ServerEnv, modelId: string) {
  const google = createGoogleGenerativeAI({ apiKey: env.geminiApiKey });
  return aisdk(google(modelId));
}

async function buildAgent(input: RunAriaAgentInput): Promise<Agent> {
  const buildStart = performance.now();
  const modelId = resolveModelId(input.env);
  const composioTools = input.composioTools ?? [];

  const ariaTools = getAriaTools(input.question, modelId, {
    meetingSnippet: input.messages,
  });
  input.pipeline?.stage("agent.build", {
    composioTools: composioTools.length,
    ariaTools: ariaTools.length,
    model: modelId,
    ms: Math.round(performance.now() - buildStart),
  });

  return new Agent({
    name: "Kivo",
    instructions: ARIA_SYSTEM_PROMPT,
    model: buildGeminiModel(input.env, modelId),
    // Gemini 2.5 Flash enables "thinking" by default, which burns internal
    // reasoning tokens before the first visible token and directly inflates
    // time-to-first-token — the single biggest LLM-side latency cost for a live
    // voice assistant. Disable it (budget 0) to keep first-token latency low.
    // The aisdk wrapper spreads `modelSettings.providerData` straight into the
    // underlying LanguageModel request, so this maps to providerOptions.google.
    modelSettings: {
      providerData: {
        providerOptions: {
          google: {
            thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
          },
        },
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
    model: resolveModelId(input.env),
  });
  const result = await buildRunner().run(
    agent,
    userPrompt,
    { signal: input.signal }
  );

  const text = result.finalOutput?.trim();
  if (!text) {
    throw new Error("Gemini returned an empty answer");
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
    model: resolveModelId(input.env),
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
