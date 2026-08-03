import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, withAuth } from "@/lib/sessions/api-response";
import { createCartesiaSpeechStream } from "@/lib/audio/cartesia-tts";
import { isKivoVoiceId } from "@/lib/audio/voices";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREVIEW_TEXT =
  "Hey, I'm Kivo. This is how I'll sound when I answer your questions.";

const PreviewSchema = z.object({
  voiceId: z.string().refine(isKivoVoiceId, "Invalid voice."),
});

/** Short MP3 sample so the settings screen can audition a voice. */
export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async () => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonError("Invalid JSON body.", 400);
      }

      const parsed = PreviewSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError("Invalid preview payload.", 400);
      }

      const env = getServerEnv();
      try {
        const stream = await createCartesiaSpeechStream(
          {
            apiKey: env.CARTESIA_API_KEY,
            modelId: env.CARTESIA_MODEL_ID,
            voiceId: parsed.data.voiceId,
          },
          PREVIEW_TEXT,
          req.signal
        );
        return new Response(stream, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Preview synthesis failed.";
        return jsonError(msg, 502);
      }
    },
    { rateLimit: { name: "voice_preview", limit: 12, windowSeconds: 60 } }
  );
}
