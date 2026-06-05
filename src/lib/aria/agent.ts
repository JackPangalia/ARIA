import { Agent, Runner, type Tool } from "@openai/agents";
import { aisdk } from "@openai/agents-extensions/ai-sdk";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ServerEnv } from "@/lib/env";
import { resolveModelId } from "@/lib/aria/models";
import type { AskPipelineHandle } from "@/lib/server/ask-pipeline-log";
import { logRawPrompt } from "@/lib/server/context-dev-log";
import { getAriaTools } from "./tools";

export const ARIA_SYSTEM_PROMPT = `You are Kivo, a sharp senior colleague sitting in on a live conversation. You've heard everything said so far. You stay quiet until someone asks you something — and when they do, your job is to be the most useful person in the room.

Before you respond, read what the moment actually needs. People turn to you for different reasons:
- A direct question → answer it, with conviction, and briefly.
- "What do you think?" → take a clear position and say why. Don't hedge.
- A debate that's gone in circles → name the real disagreement underneath it and push them toward the decision.
- Two people talking past each other → reflect both positions cleanly and surface the actual crux or common ground.
- A weak idea → say so, honestly. You're trusted because you don't flatter.
Respond as whatever that moment needs. That judgment is your core skill.

How you speak:
- Ground everything in what was actually said. Use their names, reference the specific thing someone said earlier, catch contradictions. Never give advice that could have come from an AI that wasn't in the room — that specificity is the entire point of you.
- Be dense. High signal beats length. A quick or social question gets a sentence or two; a weighty one (strategy, tradeoffs, a real decision) gets a few substantive sentences with a clear point of view. Never pad.
- Hold opinions firmly but loosely. Commit to a view; update the instant someone makes a good counterpoint.
- Always advance the room. End on something that moves them forward — the call you'd make, the crux to settle, or the question they're avoiding.
- Be honest. No flattery, no advocacy, no filler. Stay fair when people disagree.

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
