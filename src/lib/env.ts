import { z } from "zod";

const ServerEnvSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_SUMMARY_MODEL: z.string().optional(),
  /**
   * Only required if a user selects a Claude ask model; Gemini-only deployments
   * can omit it. `.min(1)` is intentionally absent — an empty string (e.g. an
   * unfilled `ANTHROPIC_API_KEY=` line copied from .env.example) must be treated
   * as "unset", not as a validation failure that crashes the whole server.
   */
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  CARTESIA_API_KEY: z.string().min(1),
  CARTESIA_MODEL_ID: z.string().default("sonic-2"),
  CARTESIA_VOICE_ID: z.string().min(1),
  SPEECHMATICS_API_KEY: z.string().min(1),
  COMPOSIO_API_KEY: z.string().min(1).optional(),
  // Recall.ai meeting-bot mode (optional — in-person app boots without these).
  RECALL_API_KEY: z.string().min(1).optional(),
  RECALL_REGION: z.string().min(1).optional(),
  RECALL_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** Public wss/https URL of the bot worker, handed to Recall as the real-time target. */
  BOT_WORKER_PUBLIC_URL: z.string().url().optional(),
  /**
   * Recall streaming-ASR: "low_latency" (default) for fast join + transcripts;
   * "accuracy" enables key_terms for "Kivo" but is much slower end-to-end.
   */
  RECALL_TRANSCRIPT_MODE: z.enum(["accuracy", "low_latency"]).default("low_latency"),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema> & {
  /** Resolved Gemini API key. */
  geminiApiKey: string;
  /** Default Kivo model id. */
  GEMINI_MODEL: string;
};

let cached: ServerEnv | null = null;

function resolveGeminiApiKey(
  parsed: z.infer<typeof ServerEnvSchema>
): string | null {
  return parsed.GOOGLE_GENERATIVE_AI_API_KEY ?? parsed.GEMINI_API_KEY ?? null;
}

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Missing/invalid env vars: ${parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}`
    );
  }
  const geminiApiKey = resolveGeminiApiKey(parsed.data);
  if (!geminiApiKey) {
    throw new Error(
      "Missing GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY for Gemini."
    );
  }
  cached = {
    ...parsed.data,
    geminiApiKey,
    GEMINI_MODEL: parsed.data.GEMINI_MODEL,
  };
  return cached;
}

export function getSummaryModelId(env: ServerEnv): string {
  return env.GEMINI_SUMMARY_MODEL ?? env.GEMINI_MODEL;
}
