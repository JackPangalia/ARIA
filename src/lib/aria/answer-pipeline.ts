import { runAriaAgentStream } from "@/lib/aria/agent";
import { resolveModelId } from "@/lib/aria/models";
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
  type AskPipelineHandle,
} from "@/lib/server/ask-pipeline-log";
import {
  takePrefetchedContext,
  type PrefetchedContextBundle,
} from "@/lib/sessions/context-prefetch-cache";
import { type ServerEnv } from "@/lib/env";
import { appendTurn } from "@/lib/sessions/repository";
import { recordAsk } from "@/lib/plan/repository";
import type { SessionDoc } from "@/lib/sessions/types";

const SENTENCE_BOUNDARY = /[.!?]+["')\]]*\s+|\n+/;
const FIRST_CHUNK_BOUNDARY = /[,;]+[\s]+|[.!?]+["')\]]*\s+|\n+/;
const FIRST_CHUNK_MIN_CHARS = 10;
const NEXT_CHUNK_MIN_CHARS = 60;

export function isAbortError(err: unknown, signal?: AbortSignal): boolean {
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

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export interface AnswerPipelineInput {
  uid: string;
  session: SessionDoc;
  question: string;
  speaker?: number | null;
  speakerName?: string | null;
  /** Raw live-transcript utterance ids that fed this question; recorded on the
   * persisted user_question turn so the UI can dedup the raw live copies. */
  sourceUtteranceIds?: string[];
  env: ServerEnv;
  signal: AbortSignal;
  /** Reuse an existing pipeline handle (route); one is created if omitted (worker). */
  pipeline?: AskPipelineHandle;
  /** Auth+session setup time for the timing summary; defaults to 0. */
  authSessionMs?: number;
  /**
   * Meeting-bot worker: called after each TTS segment is fully synthesized so audio
   * can play into the call immediately instead of waiting for the full answer MP3.
   */
  onTtsSegment?: (mp3: Uint8Array) => void | Promise<void>;
  /**
   * iOS playback path: emit the answer as a sequence of self-contained MP3
   * segments, each length-prefixed ([uint32 big-endian length][mp3 bytes]),
   * instead of one raw concatenated stream. Lets the native client play each
   * sentence with AVAudioPlayer as it arrives. Defaults to false — the browser
   * and worker keep the raw, MediaSource-friendly stream byte-for-byte.
   */
  framed?: boolean;
}

export interface AnswerPipelineResult {
  /** MP3 audio bytes for Kivo's spoken answer. */
  audioStream: ReadableStream<Uint8Array>;
  /** Resolves after streaming + persistence; never rejects (errors surface via the stream). */
  done: Promise<{ answerText: string }>;
}

/**
 * The shared "answer" engine: context → LLM → TTS → MP3, plus turn persistence,
 * compaction, and auto-title. Used by both POST /api/ask (browser, in-person) and
 * the Recall meeting-bot worker.
 *
 * Pre-LLM work (context build, tool load, agent start) is awaited here and may
 * throw — callers map those failures to their transport's error path. Streaming
 * failures surface through the returned audio stream.
 */
export async function runAnswerPipeline(
  input: AnswerPipelineInput
): Promise<AnswerPipelineResult> {
  const { uid, session, question, env, signal } = input;
  const speaker = input.speaker ?? null;
  const speakerName = input.speakerName ?? null;
  const framed = input.framed ?? false;
  const sessionId = session.id;

  const pipeline = input.pipeline ?? startAskPipeline(sessionId, question);
  const speakerLabel = speakerName ?? speaker ?? null;
  const modelUsed = resolveModelId(env);
  const intentToolkits = resolveConnectorToolkits(question);

  pipeline.stage("composio.intent", {
    toolkits: intentToolkits.join(",") || "none",
  });

  const askStartedAt = performance.now();
  const authSessionMs = input.authSessionMs ?? 0;

  void appendTurn(uid, sessionId, {
    role: "user_question",
    text: question,
    speaker,
    speakerName,
    sourceUtteranceIds: input.sourceUtteranceIds ?? [],
  })
    .then(() => pipeline.stage("persist.question", { ok: true }))
    .catch((err) => {
      console.error("[Ask] Failed to persist user question turn:", err);
      pipeline.stage("persist.question", { ok: false });
    });

  let textStream: ReadableStream<string>;
  let context: PrefetchedContextBundle;
  let contextBuildMs: number;
  let composioResult: Awaited<ReturnType<typeof loadComposioAgentTools>>;
  let composioMs: number;
  let preLlmMs: number;
  let agentStart: number;
  let agentReadyMs: number;

  setAskPipelineForComposio(pipeline);
  try {
    pipeline.stage("pre_llm", { phase: "parallel" });
    const preLlmStart = performance.now();

    const prefetched = takePrefetchedContext(sessionId, question);

    const contextPromise = prefetched
      ? (async () => {
          pipeline.stage("context.prefetch_hit", { ms: 0 });
          return { bundle: prefetched, ms: 0 };
        })()
      : (async () => {
          const t0 = performance.now();
          const bundle = await buildContextBundle({ uid, session, question });
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
          tools: [] as Awaited<ReturnType<typeof loadComposioAgentTools>>["tools"],
          cache: "empty" as const,
          fetchMs: 0,
          toolCount: 0,
          toolkitFingerprint: "",
          intentToolkits: "error",
        };
      });

    const [contextResult, composioLoaded] = await Promise.all([
      contextPromise,
      composioPromise,
    ]);
    context = contextResult.bundle;
    contextBuildMs = contextResult.ms;
    composioResult = composioLoaded;
    composioMs = composioResult.fetchMs;
    preLlmMs = performance.now() - preLlmStart;

    pipeline.stage("pre_llm.done", {
      wallMs: Math.round(preLlmMs),
      contextMs: Math.round(contextBuildMs),
      composioMs: Math.round(composioMs),
    });

    agentStart = performance.now();
    textStream = await runAriaAgentStream({
      messages: context.messages,
      question: context.question,
      env,
      uid,
      signal,
      composioTools: composioResult.tools,
      pipeline,
    });
    agentReadyMs = performance.now() - agentStart;
    pipeline.stage("agent.ready", { ms: Math.round(agentReadyMs) });
  } catch (err) {
    setAskPipelineForComposio(undefined);
    throw err;
  }

  let resolveDone!: (value: { answerText: string }) => void;
  const done = new Promise<{ answerText: string }>((resolve) => {
    resolveDone = resolve;
  });

  const audioStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      setAskPipelineForComposio(pipeline);
      let assistantText = "";

      try {
        const streamStartedAt = performance.now();
        const ttsConfig = cartesiaConfig(env);
        let llmFirstTokenMs: number | null = null;
        let llmTextDoneMs: number | null = null;
        let firstTtsEnqueueMs: number | null = null;
        let firstAudioByteMs: number | null = null;

        const ttsChunks: { text: string; index: number }[] = [];
        let chunkCount = 0;
        let textStreamDone = false;

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
            if (signal.aborted) return;
            if (drainPos >= ttsChunks.length) {
              if (textStreamDone) break;
              await new Promise((r) => setTimeout(r, 10));
              continue;
            }
            const { text, index } = ttsChunks[drainPos++];
            const ttsStart = performance.now();
            let stream: ReadableStream<Uint8Array>;
            try {
              stream = await createCartesiaSpeechStream(ttsConfig, text, signal);
            } catch (err) {
              if (isAbortError(err, signal)) return;
              throw err;
            }
            pipeline.stage("tts.ready", {
              chunk: index,
              ms: Math.round(performance.now() - ttsStart),
            });
            const reader = stream.getReader();
            const segmentBytes: Uint8Array[] = [];
            while (true) {
              if (signal.aborted) return;
              const { done: rDone, value } = await reader.read();
              if (rDone) break;
              if (value) {
                segmentBytes.push(value);
                if (firstAudioByteMs == null) {
                  firstAudioByteMs = performance.now() - askStartedAt;
                  pipeline.stage("audio.first_byte", {
                    ms: Math.round(firstAudioByteMs),
                  });
                }
                // Default (browser/worker): stream raw MP3 bytes as they arrive so
                // MediaSource playback starts immediately. Framed mode (iOS) emits
                // one self-contained, length-prefixed MP3 segment per chunk below.
                if (!framed) controller.enqueue(value);
              }
            }
            const merged =
              segmentBytes.length > 0 ? concatChunks(segmentBytes) : null;
            if (framed && merged) {
              // [uint32 big-endian length][MP3 segment] — one playable clip per chunk.
              const header = new Uint8Array(4);
              new DataView(header.buffer).setUint32(0, merged.length, false);
              controller.enqueue(header);
              controller.enqueue(merged);
            }
            if (merged && input.onTtsSegment) {
              await input.onTtsSegment(merged);
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
          const { done: rDone, value } = await reader.read();
          if (rDone) break;
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

        if (signal.aborted) {
          closeStreamOnAbort(controller, signal);
          resolveDone({ answerText: assistantText.trim() });
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
          await appendTurn(uid, sessionId, {
            role: "assistant",
            text: answer,
          });
          persistAssistantMs = performance.now() - persistStart;
          pipeline.stage("persist.answer", {
            ms: Math.round(persistAssistantMs),
          });

          import("@/lib/aria/context/auto-title")
            .then(({ autoTitleSession }) => {
              void autoTitleSession(uid, sessionId, {
                source: "qa",
                question: context.question,
                answer,
              });
            })
            .catch((err) =>
              console.error("[Auto-Title] failed to import:", err)
            );

          const compactStart = performance.now();
          compact = await maybeCompactSession(uid, sessionId);
          compactMs = performance.now() - compactStart;
        }

        const totalMs = performance.now() - askStartedAt;

        logAskTimingSummary({
          sessionId,
          speaker: speakerLabel,
          model: modelUsed,
          question: context.question,
          totalMs,
          authSessionMs,
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
          sessionId,
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

        // Record ask usage (input + output tokens) against the plan's soft cap.
        // Fire-and-forget: never block the response or fail the ask on a usage write.
        if (answer) {
          void recordAsk(
            uid,
            context.tokenEstimate + estimateTokens(answer)
          ).catch((err) =>
            console.error("[Plan] failed to record ask usage:", err)
          );
        }

        resolveDone({ answerText: answer });
      } catch (err) {
        if (closeStreamOnAbort(controller, signal)) {
          resolveDone({ answerText: assistantText.trim() });
          return;
        }
        if (isAbortError(err, signal)) {
          closeStreamOnAbort(controller, signal);
          resolveDone({ answerText: assistantText.trim() });
          return;
        }
        controller.error(err);
        resolveDone({ answerText: assistantText.trim() });
      } finally {
        setAskPipelineForComposio(undefined);
      }
    },
  });

  return { audioStream, done };
}
