import { NextRequest } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { runAriaAgentStream } from "@/lib/aria/agent";
import { getServerEnv, type ServerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  transcript: z.string(),
  question: z.string().min(1),
});

const TTS_INSTRUCTIONS =
  "Speak as ARIA. Use a warm, highly conversational tone with natural intonation, slight emotional range, and natural pauses. Do not sound robotic.";

const SENTENCE_BOUNDARY = /[.!?]+["')\]]*\s+|\n+/;
const FIRST_CHUNK_MIN_CHARS = 24;
const NEXT_CHUNK_MIN_CHARS = 60;

let openaiSingleton: OpenAI | null = null;
function getOpenAI(apiKey: string) {
  if (!openaiSingleton) openaiSingleton = new OpenAI({ apiKey });
  return openaiSingleton;
}

export async function POST(req: NextRequest) {
  let env: ServerEnv;
  try {
    env = getServerEnv();
  } catch (err) {
    return jsonError(err, 500);
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

  let textStream: ReadableStream<string>;
  try {
    textStream = await runAriaAgentStream({
      transcript: body.transcript,
      question: body.question,
      env,
      signal: req.signal,
    });
  } catch (err) {
    return jsonError(err, 500);
  }

  const audioStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Queue of in-flight TTS responses, drained in submission order so the
      // listener hears sentences in the order the model produced them.
      const ttsQueue: Promise<ReadableStream<Uint8Array> | null>[] = [];
      let chunkCount = 0;
      let textStreamDone = false;

      const enqueueChunk = (text: string) => {
        const t = text.trim();
        if (!t) return;
        chunkCount += 1;
        ttsQueue.push(
          (async () => {
            const speech = await openai.audio.speech.create(
              {
                model: env.OPENAI_TTS_MODEL,
                voice: env.OPENAI_TTS_VOICE,
                input: t.slice(0, 4096),
                response_format: "mp3",
                instructions: TTS_INSTRUCTIONS,
              },
              { signal: req.signal }
            );
            return speech.body as ReadableStream<Uint8Array> | null;
          })()
        );
      };

      const drain = (async () => {
        let drainPos = 0;
        // Wait until at least one chunk has been enqueued; otherwise we'd
        // close the controller before any audio is produced.
        while (true) {
          if (drainPos >= ttsQueue.length) {
            if (textStreamDone) break;
            await new Promise((r) => setTimeout(r, 10));
            continue;
          }
          const stream = await ttsQueue[drainPos++];
          if (!stream) continue;
          const reader = stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) controller.enqueue(value);
          }
        }
      })();

      try {
        const reader = textStream.getReader();
        let buffer = "";
        let pending = "";

        const flushPending = () => {
          if (!pending.trim()) {
            pending = "";
            return;
          }
          enqueueChunk(pending);
          pending = "";
        };

        const minCharsForNext = () =>
          chunkCount === 0 && !pending
            ? FIRST_CHUNK_MIN_CHARS
            : NEXT_CHUNK_MIN_CHARS;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          buffer += value;

          // Peel off complete sentences as they appear. Hold them in `pending`
          // until we have enough characters to justify a separate TTS call.
          while (true) {
            const match = SENTENCE_BOUNDARY.exec(buffer);
            if (!match) break;
            const end = match.index + match[0].length;
            pending += buffer.slice(0, end);
            buffer = buffer.slice(end);
            if (pending.trim().length >= minCharsForNext()) flushPending();
          }
        }

        // Final flush: anything still pending plus the unterminated tail.
        pending += buffer;
        flushPending();

        if (chunkCount === 0) {
          throw new Error("ARIA produced no output");
        }
      } catch (err) {
        controller.error(err);
        return;
      } finally {
        textStreamDone = true;
      }

      try {
        await drain;
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(audioStream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}

function jsonError(err: unknown, status: number) {
  const msg = err instanceof Error ? err.message : "unknown error";
  return new Response(JSON.stringify({ error: `Ask failed: ${msg}` }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
