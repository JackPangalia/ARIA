import { Agent, OpenAIProvider, Runner } from "@openai/agents";
import type { ServerEnv } from "@/lib/env";
import { getAriaTools } from "./tools";

export const ARIA_SYSTEM_PROMPT = `You are ARIA — an AI Interactive Real-Time Assistant participating in a live conversation.

You will be given:
1) A speaker-attributed transcript of the conversation so far.
2) A direct question someone in the room just asked you.

Rules:
- Be concise. Speak like someone in the room, not like a chatbot. 1-3 sentences unless the question genuinely demands more.
- Ground your answer in the transcript when relevant. Use real names from the transcript when present; only use labels like "Speaker 2" for speakers who are still unnamed.
- You have web search available. Use it for current, factual, newsy, time-sensitive, or explicitly research-oriented questions.
- Do not force web search for obvious conversational questions or questions that can be answered from the transcript alone.
- When web search informs your answer, briefly name the source or publication when useful.
- Stay neutral. No advocacy, no flattery, no filler.
- Never read the transcript back. Synthesize.
- Plain prose only. No markdown, no bullet points, no headings — your output will be spoken aloud.`;

interface RunAriaAgentInput {
  transcript: string;
  question: string;
  env: ServerEnv;
  signal?: AbortSignal;
}

function buildUserPrompt({ transcript, question }: RunAriaAgentInput): string {
  return `# Conversation transcript so far\n\n${
    transcript || "(no prior conversation)"
  }\n\n# Question directed to you\n\n${question}`;
}

function buildAgent(input: RunAriaAgentInput): Agent {
  return new Agent({
    name: "ARIA",
    instructions: ARIA_SYSTEM_PROMPT,
    model: input.env.OPENAI_MODEL,
    modelSettings: {
      reasoning: { effort: "none" },
    },
    tools: getAriaTools(input.question),
  });
}

function buildRunner(input: RunAriaAgentInput): Runner {
  return new Runner({
    modelProvider: new OpenAIProvider({ apiKey: input.env.OPENAI_API_KEY }),
    tracingDisabled: true,
  });
}

export async function runAriaAgent(input: RunAriaAgentInput): Promise<string> {
  const result = await buildRunner(input).run(
    buildAgent(input),
    buildUserPrompt(input),
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
  const result = await buildRunner(input).run(
    buildAgent(input),
    buildUserPrompt(input),
    { stream: true, signal: input.signal }
  );

  return result.toTextStream() as unknown as ReadableStream<string>;
}
