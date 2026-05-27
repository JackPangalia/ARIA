import { Agent, OpenAIProvider, Runner } from "@openai/agents";
import type { ServerEnv } from "@/lib/env";
import { getAriaTools } from "./tools";
import { buildComposioAgentTools } from "@/lib/composio/tools";

export const ARIA_SYSTEM_PROMPT = `You are ARIA — an AI Interactive Real-Time Assistant participating in a live conversation.

You will be given:
1) Appended messages from the conversation so far.
2) A direct question someone in the room just asked you.

Rules:
- Be concise. Speak like someone in the room, not like a chatbot. 1-3 sentences unless the question genuinely demands more.
- Ground your answer in the messages when relevant. Refer to speakers using their labels (e.g. "Speaker 1", "Speaker 2").
- You have web search available. Use it for current, factual, newsy, time-sensitive, or explicitly research-oriented questions.
- Do not force web search for obvious conversational questions or questions that can be answered from the messages alone.
- When web search informs your answer, briefly name the source or publication when useful.
- You may also have access to the user's connected apps (e.g. Notion) via additional tools. Use them only when the user explicitly asks to read from or write to a connected app. After a successful action, briefly confirm what you did.
- Stay neutral. No advocacy, no flattery, no filler.
- Never read the messages back. Synthesize.
- Plain prose only. No markdown, no bullet points, no headings — your output will be spoken aloud.`;

interface RunAriaAgentInput {
  messages: string;
  question: string;
  env: ServerEnv;
  uid?: string;
  model?: string;
  signal?: AbortSignal;
}

export function buildAriaUserPrompt(input: {
  messages: string;
  question: string;
}): string {
  return `# Messages so far\n\n${
    input.messages || "(no messages yet)"
  }\n\n# Question\n\n${input.question}`;
}

async function buildAgent(input: RunAriaAgentInput): Promise<Agent> {
  const composioTools = await buildComposioAgentTools(input.uid).catch(
    (err) => {
      console.error("[Composio] Failed to load tools:", err);
      return [];
    }
  );

  return new Agent({
    name: "ARIA",
    instructions: ARIA_SYSTEM_PROMPT,
    model: input.model ?? input.env.OPENAI_MODEL,
    modelSettings: {
      reasoning: { effort: "none" },
    },
    tools: [...getAriaTools(input.question), ...composioTools],
  });
}

function buildRunner(input: RunAriaAgentInput): Runner {
  return new Runner({
    modelProvider: new OpenAIProvider({ apiKey: input.env.OPENAI_API_KEY }),
    tracingDisabled: true,
  });
}

export async function runAriaAgent(input: RunAriaAgentInput): Promise<string> {
  const agent = await buildAgent(input);
  const result = await buildRunner(input).run(
    agent,
    buildAriaUserPrompt(input),
    { signal: input.signal }
  );

  const text = result.finalOutput?.trim();
  if (!text) {
    throw new Error("OpenAI returned an empty answer");
  }

  return text;
}

export async function runAriaAgentStream(
  input: RunAriaAgentInput
): Promise<ReadableStream<string>> {
  const agent = await buildAgent(input);
  const result = await buildRunner(input).run(
    agent,
    buildAriaUserPrompt(input),
    { stream: true, signal: input.signal }
  );

  return result.toTextStream() as unknown as ReadableStream<string>;
}
