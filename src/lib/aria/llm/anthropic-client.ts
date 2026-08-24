import { createAnthropic } from "@ai-sdk/anthropic";
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

const MeetingSummarySchema = z.object({
  overview: z.string(),
  keyPoints: z.array(z.string()),
  decisions: z.array(z.string()),
  actionItems: z.array(z.string()),
});

export type ParsedMeetingSummary = z.infer<typeof MeetingSummarySchema>;

const CleanedTranscriptSchema = z.object({
  turns: z.array(
    z.object({
      /** Ids of the raw turns this entry covers — several when merging. */
      sourceIds: z.array(z.string()),
      text: z.string(),
    })
  ),
});

export type ParsedCleanedTranscript = z.infer<typeof CleanedTranscriptSchema>;

/** Long enough for a full rolling summary with its facts array. */
const MAX_SUMMARY_TOKENS = 4096;

export function getAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("Missing ANTHROPIC_API_KEY env var.");
  }
  return key;
}

export function getAnthropicProvider() {
  return createAnthropic({ apiKey: getAnthropicApiKey() });
}

export async function llmGenerateText(input: {
  model: string;
  system: string;
  user: string;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<string> {
  const anthropic = getAnthropicProvider();
  const { text } = await generateText({
    model: anthropic(input.model),
    system: input.system,
    prompt: input.user,
    maxOutputTokens: input.maxOutputTokens,
    temperature: input.temperature,
  });
  return text.trim();
}

export async function llmGenerateSummary(input: {
  model: string;
  system: string;
  user: string;
}): Promise<ParsedSummary> {
  const anthropic = getAnthropicProvider();
  const { object } = await generateObject({
    model: anthropic(input.model),
    system: input.system,
    prompt: input.user,
    schema: SummarySchema,
    maxOutputTokens: MAX_SUMMARY_TOKENS,
  });
  return object;
}

export async function llmGenerateMeetingSummary(input: {
  model: string;
  system: string;
  user: string;
}): Promise<ParsedMeetingSummary> {
  const anthropic = getAnthropicProvider();
  const { object } = await generateObject({
    model: anthropic(input.model),
    system: input.system,
    prompt: input.user,
    schema: MeetingSummarySchema,
    maxOutputTokens: MAX_SUMMARY_TOKENS,
  });
  return object;
}

/**
 * Rewrites transcript turns in place, keyed by turn id. Output tokens scale
 * with the transcript itself, so the caller chunks and sets a budget rather
 * than reusing the summary cap.
 */
export async function llmCleanTranscript(input: {
  model: string;
  system: string;
  user: string;
  maxOutputTokens: number;
}): Promise<ParsedCleanedTranscript> {
  const anthropic = getAnthropicProvider();
  const { object } = await generateObject({
    model: anthropic(input.model),
    system: input.system,
    prompt: input.user,
    schema: CleanedTranscriptSchema,
    maxOutputTokens: input.maxOutputTokens,
  });
  return object;
}
