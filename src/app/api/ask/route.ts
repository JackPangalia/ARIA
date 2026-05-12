import { NextRequest } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow this function to stream long enough for a full ARIA reply.
export const maxDuration = 60;

const BodySchema = z.object({
  transcript: z.string(),
  question: z.string().min(1),
});

const SYSTEM_PROMPT = `You are ARIA — an AI Interactive Real-Time Assistant participating in a live conversation.

You will be given:
1) A speaker-attributed transcript of the conversation so far.
2) A direct question someone in the room just asked you.

Rules:
- Be concise. Speak like someone in the room, not like a chatbot. 1-3 sentences unless the question genuinely demands more.
- Ground your answer in the transcript when relevant. Cite who said what naturally ("Like Speaker 2 mentioned...").
- Stay neutral. No advocacy, no flattery, no filler.
- Never read the transcript back. Synthesize.
- Plain prose only. No markdown, no bullet points, no headings — your output will be spoken aloud.`;

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

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const userPrompt = `# Conversation transcript so far\n\n${
    body.transcript || "(no prior conversation)"
  }\n\n# Question directed to you\n\n${body.question}`;

  try {
    const answer = await openai.responses.create(
      {
        model: env.OPENAI_MODEL,
        instructions: SYSTEM_PROMPT,
        input: userPrompt,
        reasoning: { effort: "none" },
      },
      { signal: req.signal }
    );

    const text = answer.output_text.trim();
    if (!text) {
      throw new Error("OpenAI returned an empty answer");
    }

    const speech = await openai.audio.speech.create(
      {
        model: env.OPENAI_TTS_MODEL,
        voice: env.OPENAI_TTS_VOICE,
        input: text.slice(0, 4096),
        response_format: "mp3",
        instructions:
          "Speak as ARIA: calm, concise, thoughtful, and natural in a live conversation.",
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
    return new Response(JSON.stringify({ error: `Ask failed: ${msg}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
