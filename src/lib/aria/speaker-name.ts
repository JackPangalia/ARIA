import { Agent, OpenAIProvider, Runner, tool } from "@openai/agents";
import { z } from "zod";
import type { ServerEnv } from "@/lib/env";

interface ExtractSpeakerNameInput {
  text: string;
  env: ServerEnv;
  signal?: AbortSignal;
}

const ASSIGN_NAME_SCHEMA = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .describe("The speaker's self-provided name, without filler words."),
});

const SPEAKER_NAME_SYSTEM_PROMPT = `You extract self-introduced speaker names for ARIA.

You will receive text that was said immediately after someone called on ARIA.

Rules:
- If the speaker is introducing or renaming themselves, call assign_current_speaker_name with only the name.
- Handle natural phrasing like "my name is Jack", "I'm Jack", "call me Jack", "this is Jack", or "actually I'm Jackie".
- Do not assign names for third-person statements like "Sarah is the PM" or "Speaker two is Brian".
- Do not assign a name if the text is only a normal question or is ambiguous.
- The app already knows which diarized speaker said this. Never infer a speaker number.
- If no name should be assigned, do not call the tool and respond exactly: NO_NAME.`;

function sanitizeSpeakerName(name: string): string | null {
  const clean = name
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");

  if (!clean) return null;
  if (clean.length > 80) return null;
  return clean;
}

export async function extractSpeakerName({
  text,
  env,
  signal,
}: ExtractSpeakerNameInput): Promise<string | null> {
  let assignedName: string | null = null;

  const assignCurrentSpeakerName = tool({
    name: "assign_current_speaker_name",
    description:
      "Assign a self-introduced name to the current diarized speaker.",
    parameters: ASSIGN_NAME_SCHEMA,
    async execute({ name }) {
      assignedName = sanitizeSpeakerName(name);
      return assignedName
        ? `Assigned current speaker name to ${assignedName}.`
        : "No valid speaker name was provided.";
    },
  });

  const agent = new Agent({
    name: "ARIA Speaker Name Extractor",
    instructions: SPEAKER_NAME_SYSTEM_PROMPT,
    model: env.OPENAI_MODEL,
    modelSettings: {
      reasoning: { effort: "none" },
    },
    tools: [assignCurrentSpeakerName],
  });

  const runner = new Runner({
    modelProvider: new OpenAIProvider({ apiKey: env.OPENAI_API_KEY }),
    tracingDisabled: true,
  });

  await runner.run(agent, `# Wake request text\n\n${text}`, { signal });
  return assignedName;
}
