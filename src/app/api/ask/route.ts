import { NextRequest } from "next/server";
import { runAriaAgentStream } from "@/lib/aria/agent";
import { isValidModel, resolveModelId } from "@/lib/aria/models";
import { buildContextBundle } from "@/lib/aria/context/build-context";
import { maybeCompactSession } from "@/lib/aria/context/summarize";
import { estimateTokens } from "@/lib/aria/context/token-estimate";
import {
  createCartesiaSpeechStream,
  type CartesiaTtsConfig,
} from "@/lib/audio/cartesia-tts";
import { resolveConnectorToolkits } from "@/lib/composio/intent";
import { loadComposioAgentTools } from "@/lib/composio/tools-cache";
import { logAskComplete } from "@/lib/server/context-dev-log";
import {
  logAskTimingSummary,
  setAskPipelineForComposio,
  startAskPipeline,
} from "@/lib/server/ask-pipeline-log";
import { takePrefetchedContext } from "@/lib/sessions/context-prefetch-cache";
import { getServerEnv, type ServerEnv } from "@/lib/env";
import { AskBodySchema } from "@/lib/sessions/types";
import { authErrorResponse, verifyRequestAuth } from "@/lib/firebase/verify-auth";
import {
  appendTurn,
  assertSessionOwner,
} from "@/lib/sessions/repository";
import type { SessionDoc } from "@/lib/sessions/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SENTENCE_BOUNDARY = /[.!?]+["')\]]*\s+|\n+/;
const FIRST_CHUNK_BOUNDARY = /[,;]+[\s]+|[.!?]+["')\]]*\s+|\n+/;
const FIRST_CHUNK_MIN_CHARS = 10;
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

function cartesiaConfig(env: ServerEnv): CartesiaTtsConfig {
  return {
    apiKey: env.CARTESIA_API_KEY,
    modelId: env.CARTESIA_MODEL_ID,
    voiceId: env.CARTESIA_VOICE_ID,
  };
}

export async function POST(req: NextRequest) {
  const requestStart = performance.now();
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

  let session: SessionDoc;
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

  const pipeline = startAskPipeline(body.sessionId, body.question);
  const speakerLabel = body.speakerName ?? body.speaker ?? null;
  const modelOverride = isValidModel(body.model) ? body.model : null;
  const modelUsed = resolveModelId(modelOverride, env);
  const intentToolkits = resolveConnectorToolkits(body.question);

  pipeline.stage("session.ok", {
    status: session.status,
    setupMs: Math.round(performance.now() - requestStart),
  });
  pipeline.stage("composio.intent", {
    toolkits: intentToolkits.join(",") || "none",
  });

  const audioStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const askStartedAt = performance.now();
      setAskPipelineForComposio(pipeline);

      void appendTurn(uid, body.sessionId, {
        role: "user_question",
        text: body.question,
        speaker: body.speaker ?? null,
        speakerName: body.speakerName ?? null,
      })
        .then(() => pipeline.stage("persist.question", { ok: true }))
        .catch((err) => {
          console.error("[Ask] Failed to persist user question turn:", err);
          pipeline.stage("persist.question", { ok: false });
        });

      try {
        pipeline.stage("pre_llm", { phase: "parallel" });
        const preLlmStart = performance.now();

        const prefetched = takePrefetchedContext(
          body.sessionId,
          body.question
        );

        const contextPromise = prefetched
          ? (async () => {
              pipeline.stage("context.prefetch_hit", {
                ms: 0,
              });
              return { bundle: prefetched, ms: 0 };
            })()
          : (async () => {
              const t0 = performance.now();
              const bundle = await buildContextBundle({
                uid,
                session,
                question: body.question,
              });
              const ms = performance.now() - t0;
              pipeline.stage("context.done", { ms: Math.round(ms) });
              return { bundle, ms };
            })();

        const composioPromise = loadComposioAgentTools(uid, {
          toolkits: intentToolkits,
        })
          .then((result) => {
            pipeline.stage("composio.done", {
              cache: result.cache,
              tools: result.toolCount,
              intent: result.intentToolkits,
              ms: Math.round(result.fetchMs),
            });
            return result;
          })
          .catch((err) => {
            console.error("[Composio] Failed to load tools:", err);
            pipeline.stage("composio.done", { cache: "error", tools: 0 });
            return {
              tools: [] as Awaited<
                ReturnType<typeof loadComposioAgentTools>
              >["tools"],
              cache: "empty" as const,
              fetchMs: 0,
              toolCount: 0,
              toolkitFingerprint: "",
              intentToolkits: "error",
            };
          });

        const [contextResult, composioResult] = await Promise.all([
          contextPromise,
          composioPromise,
        ]);
        const context = contextResult.bundle;
        const contextBuildMs = contextResult.ms;
        const composioMs = composioResult.fetchMs;
        const composioTools = composioResult.tools;
        const preLlmMs = performance.now() - preLlmStart;

        pipeline.stage("pre_llm.done", {
          wallMs: Math.round(preLlmMs),
          contextMs: Math.round(contextBuildMs),
          composioMs: Math.round(composioMs),
        });

        const agentStart = performance.now();
        const textStream = await runAriaAgentStream({
          messages: context.messages,
          question: context.question,
          env,
          uid,
          model: modelOverride ?? undefined,
          signal: req.signal,
          composioTools,
          pipeline,
        });
        const agentReadyMs = performance.now() - agentStart;
        pipeline.stage("agent.ready", { ms: Math.round(agentReadyMs) });

        const streamStartedAt = performance.now();
        const ttsConfig = cartesiaConfig(env);
        let llmFirstTokenMs: number | null = null;
        let llmTextDoneMs: number | null = null;
        let firstTtsEnqueueMs: number | null = null;
        let firstAudioByteMs: number | null = null;

        const ttsChunks: { text: string; index: number }[] = [];
        let chunkCount = 0;
        let textStreamDone = false;
        let assistantText = "";

        const enqueueChunk = (text: string) => {
          const t = text.trim();
          if (!t) return;
          chunkCount += 1;
          if (firstTtsEnqueueMs == null) {
            firstTtsEnqueueMs = performance.now() - askStartedAt;
            pipeline.stage("tts.enqueue", {
              chunk: chunkCount,
              chars: t.length,
              ms: Math.round(firstTtsEnqueueMs),
            });
          }
          ttsChunks.push({ text: t, index: chunkCount });
        };

        // Cartesia free tier allows very low concurrency (e.g. 2). Synthesize one chunk at a time.
        const drain = (async () => {
          let drainPos = 0;
          while (true) {
            if (req.signal.aborted) return;
            if (drainPos >= ttsChunks.length) {
              if (textStreamDone) break;
              await new Promise((r) => setTimeout(r, 10));
              continue;
            }
            const { text, index } = ttsChunks[drainPos++];
            const ttsStart = performance.now();
            let stream: ReadableStream<Uint8Array>;
            try {
              stream = await createCartesiaSpeechStream(
                ttsConfig,
                text,
                req.signal
              );
            } catch (err) {
              if (isAbortError(err, req.signal)) return;
              throw err;
            }
            pipeline.stage("tts.ready", {
              chunk: index,
              ms: Math.round(performance.now() - ttsStart),
            });
            const reader = stream.getReader();
            while (true) {
              if (req.signal.aborted) return;
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                if (firstAudioByteMs == null) {
                  firstAudioByteMs = performance.now() - askStartedAt;
                  pipeline.stage("audio.first_byte", {
                    ms: Math.round(firstAudioByteMs),
                  });
                }
                controller.enqueue(value);
              }
            }
          }
        })();

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

        const boundaryForChunk = () =>
          chunkCount === 0 && !pending
            ? FIRST_CHUNK_BOUNDARY
            : SENTENCE_BOUNDARY;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          if (llmFirstTokenMs == null) {
            llmFirstTokenMs = performance.now() - askStartedAt;
            pipeline.stage("llm.first_token", {
              ms: Math.round(llmFirstTokenMs),
            });
          }
          assistantText += value;
          buffer += value;

          const boundary = boundaryForChunk();
          while (true) {
            const match = boundary.exec(buffer);
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
          throw new Error("Kivo produced no output");
        }

        llmTextDoneMs = performance.now() - askStartedAt;
        pipeline.stage("llm.text_done", {
          ms: Math.round(llmTextDoneMs),
          chars: assistantText.length,
          ttsChunks: chunkCount,
        });

        textStreamDone = true;
        await drain;

        if (req.signal.aborted) {
          closeStreamOnAbort(controller, req.signal);
          return;
        }
        controller.close();

        const streamDoneMs = performance.now() - streamStartedAt;
        pipeline.stage("stream.done", { ms: Math.round(streamDoneMs) });

        const answer = assistantText.trim();
        const agentMs = performance.now() - agentStart;
        let compact = null;
        let compactMs = 0;
        let persistAssistantMs = 0;

        if (answer) {
          const persistStart = performance.now();
          await appendTurn(uid, body.sessionId, {
            role: "assistant",
            text: answer,
          });
          persistAssistantMs = performance.now() - persistStart;
          pipeline.stage("persist.answer", {
            ms: Math.round(persistAssistantMs),
          });

          import("@/lib/aria/context/auto-title")
            .then(({ autoTitleSession }) => {
              void autoTitleSession(uid, body.sessionId, session.title);
            })
            .catch((err) =>
              console.error("[Auto-Title] failed to import:", err)
            );

          const compactStart = performance.now();
          compact = await maybeCompactSession(uid, body.sessionId);
          compactMs = performance.now() - compactStart;
        }

        const totalMs = performance.now() - askStartedAt;

        logAskTimingSummary({
          sessionId: body.sessionId,
          speaker: speakerLabel,
          model: modelUsed,
          question: context.question,
          totalMs,
          authSessionMs: askStartedAt - requestStart,
          contextBuildMs,
          composioMs,
          preLlmMs,
          agentReadyMs,
          llmFirstTokenMs,
          llmTextDoneMs,
          firstTtsEnqueueMs,
          firstAudioByteMs,
          streamDoneMs,
          persistAssistantMs,
          compactMs,
          ttsChunkCount: chunkCount,
          answerChars: answer.length,
          answerTokens: estimateTokens(answer),
          composioCache: composioResult.cache,
          composioToolCount: composioResult.toolCount,
        });

        logAskComplete({
          sessionId: body.sessionId,
          speaker: speakerLabel,
          model: modelUsed,
          contextBuildMs,
          composioMs,
          agentMs,
          compactMs,
          totalMs,
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
      } finally {
        setAskPipelineForComposio(undefined);
      }
    },
  });

  return new Response(audioStream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
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
