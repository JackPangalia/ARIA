import { z } from "zod";

const ServerEnvSchema = z.object({
  /**
   * Required: every ask model is Anthropic. Failing at boot beats silently
   * answering with the wrong model — or no model — mid-turn.
   */
  ANTHROPIC_API_KEY: z.string().min(1),
  CARTESIA_API_KEY: z.string().min(1),
  CARTESIA_MODEL_ID: z.string().default("sonic-3.6"),
  CARTESIA_VOICE_ID: z.string().min(1),
  SPEECHMATICS_API_KEY: z.string().min(1),
  /**
   * Regional realtime endpoint the CLIENT connects to (temporary keys work in
   * both). "us" halves the WS round trip for North American users — partials,
   * finals, and EndOfUtterance all land ~100ms sooner, which is directly in
   * the silence→answer path. Verified 2026-07-04: same temp key starts
   * sessions in both regions.
   */
  SPEECHMATICS_RT_REGION: z.enum(["eu", "us"]).default("us"),
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

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | null = null;

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
  cached = parsed.data;
  return cached;
}
