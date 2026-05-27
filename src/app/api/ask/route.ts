import { NextRequest } from "next/server";
import { runAriaAgentStream } from "@/lib/aria/agent";
import { isValidModel } from "@/lib/aria/models";
import { getOpenAI } from "@/lib/aria/context/openai-client";
import { buildContextBundle } from "@/lib/aria/context/build-context";
import { maybeCompactSession } from "@/lib/aria/context/summarize";
import { estimateTokens } from "@/lib/aria/context/token-estimate";
import { logAskComplete } from "@/lib/server/context-dev-log";
import { getServerEnv, type ServerEnv } from "@/lib/env";
import { AskBodySchema } from "@/lib/sessions/types";
import { authErrorResponse, verifyRequestAuth } from "@/lib/firebase/verify-auth";
import {
  appendTurn,
  assertSessionOwner,
} from "@/lib/sessions/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TTS_INSTRUCTIONS =
  "Speak as ARIA. Use a warm, highly conversational tone with natural intonation, slight emotional range, and natural pauses. Do not sound robotic.";

const SENTENCE_BOUNDARY = /[.!?]+["')\]]*\s+|\n+/;
const FIRST_CHUNK_MIN_CHARS = 24;
const NEXT_CHUNK_MIN_CHARS = 60;

function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && /aborted/i.test(err.message)) return true;
  return false;
}

function closeStreamOnAbort(
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal: AbortSignal
) {
  if (!signal.aborted) return false;
  try {
    controller.close();
  } catch {
    // ignore double-close
  }
  return true;
}

export async function POST(req: NextRequest) {
  let env: ServerEnv;
  try {
    env = getServerEnv();
  } catch (err) {
    return jsonError(err, 500);
  }

  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(req));
  } catch (error) {
    return authErrorResponse(error);
  }

  let body;
  try {
    body = AskBodySchema.parse(await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let session;
  try {
    session = await assertSessionOwner(uid, body.sessionId);
  } catch {
    return new Response(JSON.stringify({ error: "Session not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (session.status === "archived") {
    return new Response(JSON.stringify({ error: "Session is archived." }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  const askStartedAt = performance.now();
  const speakerLabel = body.speakerName ?? body.speaker ?? null;

  await appendTurn(uid, body.sessionId, {
    role: "user_question",
    text: body.question,
    speaker: body.speaker ?? null,
    speakerName: body.speakerName ?? null,
  });

  const contextBuildStart = performance.now();
  const context = await buildContextBundle({
    uid,
    session,
    question: body.question,
  });
  const contextBuildMs = performance.now() - contextBuildStart;

  const openai = getOpenAI(env.OPENAI_API_KEY);

  let textStream: ReadableStream<string>;
  const agentStart = performance.now();
  try {
    const modelOverride = isValidModel(body.model) ? body.model : null;
    textStream = await runAriaAgentStream({
      messages: context.messages,
      question: context.question,
      env,
      uid,
      model: modelOverride ?? undefined,
      signal: req.signal,
    });
  } catch (err) {
    return jsonError(err, 500);
  }

  const audioStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const ttsQueue: Promise<ReadableStream<Uint8Array> | null>[] = [];
      let chunkCount = 0;
      let textStreamDone = false;
      let assistantText = "";

      const enqueueChunk = (text: string) => {
        const t = text.trim();
        if (!t) return;
        chunkCount += 1;
        ttsQueue.push(
          (async () => {
            try {
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
            } catch (err) {
              if (isAbortError(err, req.signal)) return null;
              throw err;
            }
          })()
        );
      };

      const drain = (async () => {
        let drainPos = 0;
        while (true) {
          if (req.signal.aborted) return;
          if (drainPos >= ttsQueue.length) {
            if (textStreamDone) break;
            await new Promise((r) => setTimeout(r, 10));
            continue;
          }
          let stream: ReadableStream<Uint8Array> | null;
          try {
            stream = await ttsQueue[drainPos++];
          } catch (err) {
            if (isAbortError(err, req.signal)) return;
            throw err;
          }
          if (!stream) continue;
          const reader = stream.getReader();
          while (true) {
            if (req.signal.aborted) return;
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
          assistantText += value;
          buffer += value;

          while (true) {
            const match = SENTENCE_BOUNDARY.exec(buffer);
            if (!match) break;
            const end = match.index + match[0].length;
            pending += buffer.slice(0, end);
            buffer = buffer.slice(end);
            if (pending.trim().length >= minCharsForNext()) flushPending();
          }
        }

        pending += buffer;
        flushPending();

        if (chunkCount === 0) {
          throw new Error("ARIA produced no output");
        }
      } catch (err) {
        if (closeStreamOnAbort(controller, req.signal)) return;
        if (isAbortError(err, req.signal)) {
          closeStreamOnAbort(controller, req.signal);
          return;
        }
        controller.error(err);
        return;
      } finally {
        textStreamDone = true;
      }

      if (req.signal.aborted) {
        closeStreamOnAbort(controller, req.signal);
        return;
      }

      try {
        await drain;
        if (req.signal.aborted) {
          closeStreamOnAbort(controller, req.signal);
          return;
        }
        controller.close();

        const answer = assistantText.trim();
        const agentMs = performance.now() - agentStart;
        let compact = null;
        let compactMs = 0;

        if (answer) {
          await appendTurn(uid, body.sessionId, {
            role: "assistant",
            text: answer,
          });
          import("@/lib/aria/context/auto-title").then(({ autoTitleSession }) => {
            void autoTitleSession(uid, body.sessionId, session.title);
          }).catch(err => console.error("[Auto-Title] failed to import:", err));

          const compactStart = performance.now();
          compact = await maybeCompactSession(uid, body.sessionId);
          compactMs = performance.now() - compactStart;
        }

        logAskComplete({
          sessionId: body.sessionId,
          speaker: speakerLabel,
          model: env.OPENAI_MODEL,
          contextBuildMs,
          agentMs,
          compactMs,
          totalMs: performance.now() - askStartedAt,
          bundle: context.log,
          answerChars: answer.length,
          answerTokens: estimateTokens(answer),
          compact,
        });
      } catch (err) {
        if (closeStreamOnAbort(controller, req.signal)) return;
        if (isAbortError(err, req.signal)) {
          closeStreamOnAbort(controller, req.signal);
          return;
        }
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
