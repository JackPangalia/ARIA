import { NextRequest } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BodySchema = z.object({
  text: z.string().trim().min(1).max(500),
});

const TTS_INSTRUCTIONS =
  "Speak as ARIA. Use a warm, highly conversational tone with natural intonation, slight emotional range, and natural pauses. Do not sound robotic.";

let openaiSingleton: OpenAI | null = null;
function getOpenAI(apiKey: string) {
  if (!openaiSingleton) openaiSingleton = new OpenAI({ apiKey });
  return openaiSingleton;
}

export async function POST(req: NextRequest) {
  let env;
  try {
    env = getServerEnv();
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "env error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const openai = getOpenAI(env.OPENAI_API_KEY);

  try {
    const speech = await openai.audio.speech.create(
      {
        model: env.OPENAI_TTS_MODEL,
        voice: env.OPENAI_TTS_VOICE,
        input: body.text,
        response_format: "mp3",
        instructions: TTS_INSTRUCTIONS,
      },
      { signal: req.signal }
    );

    return new Response(speech.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return new Response(JSON.stringify({ error: `Speak failed: ${msg}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
