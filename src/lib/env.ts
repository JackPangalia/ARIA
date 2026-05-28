import { z } from "zod";

const ServerEnvSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  GEMINI_PRO_MODEL: z.string().default("gemini-3.1-pro"),
  GEMINI_SUMMARY_MODEL: z.string().optional(),
  CARTESIA_API_KEY: z.string().min(1),
  CARTESIA_MODEL_ID: z.string().default("sonic-2"),
  CARTESIA_VOICE_ID: z.string().min(1),
  SPEECHMATICS_API_KEY: z.string().min(1),
  COMPOSIO_API_KEY: z.string().min(1).optional(),
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
