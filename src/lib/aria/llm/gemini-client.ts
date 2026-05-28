import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject, generateText } from "ai";
import { z } from "zod";

const SummarySchema = z.object({
  rollingSummary: z.string(),
  keyDecisions: z.array(z.string()),
  openQuestions: z.array(z.string()),
  timeline: z.array(z.string()),
  facts: z.array(
    z.object({
      text: z.string(),
      category: z.enum(["fact", "preference", "decision", "todo", "name"]),
    })
  ),
});

export type ParsedSummary = z.infer<typeof SummarySchema>;

export function getGeminiApiKey(): string {
  const key =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "Missing GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY env var."
    );
  }
  return key;
}

export function getGeminiProvider() {
  return createGoogleGenerativeAI({ apiKey: getGeminiApiKey() });
}

export function resolveGeminiModelId(
  modelOverride: string | undefined,
  env: { GEMINI_MODEL: string; GEMINI_PRO_MODEL: string }
): string {
  if (modelOverride) return modelOverride;
  return env.GEMINI_MODEL;
}

export async function geminiGenerateText(input: {
  model: string;
  system: string;
  user: string;
  maxOutputTokens?: number;
}): Promise<string> {
  const google = getGeminiProvider();
  const { text } = await generateText({
    model: google(input.model),
    system: input.system,
    prompt: input.user,
    maxOutputTokens: input.maxOutputTokens,
  });
  return text.trim();
}

export async function geminiGenerateSummary(input: {
  model: string;
  system: string;
  user: string;
}): Promise<ParsedSummary> {
  const google = getGeminiProvider();
  const { object } = await generateObject({
    model: google(input.model),
    system: input.system,
    prompt: input.user,
    schema: SummarySchema,
  });
  return object;
}
