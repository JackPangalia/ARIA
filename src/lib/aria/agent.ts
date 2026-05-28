import { Agent, Runner, type Tool } from "@openai/agents";
import { aisdk } from "@openai/agents-extensions/ai-sdk";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ServerEnv } from "@/lib/env";
import { resolveModelId, type ModelId } from "@/lib/aria/models";
import type { AskPipelineHandle } from "@/lib/server/ask-pipeline-log";
import { getAriaTools } from "./tools";

export const ARIA_SYSTEM_PROMPT = `You are Kivo — the voice assistant inside the ARIA app, participating in a live conversation.

You will be given:
1) Appended messages from the conversation so far.
2) A direct question someone in the room just asked you.

Rules:
- Speak like someone in the room, not like a chatbot. For quick or social questions, 1-3 sentences. For analytical, strategic, or "big picture" questions (policy, debriefs, global situation, tradeoffs), give 4-6 substantive sentences with a clear point of view — still plain spoken prose.
- Ground your answer in the messages when relevant. Refer to speakers using their labels (e.g. "Speaker 1", "Speaker 2").
- Google Search is available only when needed: current facts (news, markets, weather, dates), current events, or when someone explicitly asks you to search or look something up. Do not search for opinions you can answer from the room, small talk, or recap-only questions.
- When search notes inform your answer, weave in specific facts and name a source or publication when useful.
- You may also have access to the user's connected apps (e.g. Notion) via additional tools. Use them only when the user explicitly asks to read from or write to a connected app. After a successful action, briefly confirm what you did.
- Stay neutral. No advocacy, no flattery, no filler.
- Never read the messages back. Synthesize.
- Plain prose only. No markdown, no bullet points, no headings — your output will be spoken aloud.`;

interface RunAriaAgentInput {
  messages: string;
  question: string;
  env: ServerEnv;
  uid?: string;
  model?: ModelId;
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
  const modelId = resolveModelId(input.model, input.env);
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
  const result = await buildRunner().run(
    agent,
    buildAriaUserPrompt(input),
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
  input.pipeline?.stage("agent.run", { phase: "starting" });
  const result = await buildRunner().run(
    agent,
    buildAriaUserPrompt(input),
    { stream: true, signal: input.signal }
  );
  input.pipeline?.stage("agent.stream_ready", {
    ms: Math.round(performance.now() - runStart),
  });

  return result.toTextStream() as unknown as ReadableStream<string>;
}
