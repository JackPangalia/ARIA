import {
  resolveEffectiveAskModelOption,
  runAriaAgentStream,
} from "@/lib/aria/agent";
import { DEFAULT_ASK_MODEL_ID, getAskModelOption, type AskModelId } from "@/lib/aria/models";
import { buildContextBundle } from "@/lib/aria/context/build-context";
import { maybeCompactSession } from "@/lib/aria/context/summarize";
import { estimateTokens } from "@/lib/aria/context/token-estimate";
import {
  createCartesiaSpeechStream,
  type CartesiaTtsConfig,
} from "@/lib/audio/cartesia-tts";
import {
  CARTESIA_PCM_ENCODING,
  cartesiaPcmBytesPerSecond,
  createCartesiaContextStream,
} from "@/lib/audio/cartesia-ws";
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
import {
  VoicePhraseBuffer,
  WordStreamBuffer,
} from "@/lib/aria/tts-phrase-buffer";
import { WEB_SEARCH_TOOL_NAME } from "@/lib/aria/tools";
import { encodeMuxAudio, encodeMuxEvent, encodeMuxText } from "@/lib/audio/answer-mux";

/**
 * Spoken hand-off for the seconds Anthropic spends searching. A voice that goes
 * silent through a tool call reads as frozen, so Kivo says one short line while
 * the lookup runs — the same thing a person does when they reach for a phone.
 * Kept deliberately brief and varied so a searched answer doesn't open the same
 * way every time.
 */
export const SEARCH_FILLER_PHRASES = [
  "One second.",
  "Checking.",
  "Just a moment.",
] as const;

export function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && /aborted/i.test(err.message)) return true;
  return false;
}

/**
 * Shortest interrupted answer worth keeping. Below this an answer says nothing
 * except that it was cut off — see `persistInterruptedAnswer`. Five words is
 * about where a cut-off answer starts carrying a claim ("Stanley Park's bigger
 * and has") rather than a false start ("I'm", "What kinds of things").
 */
const MIN_INTERRUPTED_ANSWER_WORDS = 5;

function countWords(text: string): number {
  const matched = text.trim().match(/[^\s]+/g);
  return matched ? matched.length : 0;
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

function cartesiaConfig(
  env: ServerEnv,
  voice?: AnswerPipelineInput["voice"]
): CartesiaTtsConfig {
  return {
    apiKey: env.CARTESIA_API_KEY,
    modelId: env.CARTESIA_MODEL_ID,
    voiceId: voice?.voiceId || env.CARTESIA_VOICE_ID,
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
  providerSpeakerLabel?: string | null;
  sourceUtteranceIds?: string[];
  env: ServerEnv;
  signal: AbortSignal;
  /** User's chosen ask model; defaults to Claude Sonnet 5 when omitted. */
  askModel?: AskModelId;
  /** Reuse an existing pipeline handle (route); one is created if omitted (worker). */
  pipeline?: AskPipelineHandle;
  /** Auth+session setup time for the timing summary; defaults to 0. */
  authSessionMs?: number;
  /**
   * Speculative (eager) dispatch: this answer was requested before the
   * speaker's endpoint was confirmed, to pre-warm the LLM/TTS. It may be
   * discarded (client aborts before adopting). The `user_question` turn is
   * written only when the first audio byte is produced, so a discarded
   * speculative request and a failed TTS attempt both leave no phantom
   * question in the transcript. Defaults to false.
   */
  speculative?: boolean;
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
  /** Per-user voice preference (curated Cartesia preset). */
  voice?: { voiceId?: string | null };
  /**
   * Client can play raw PCM (Web Audio path). When set, the answer is
   * synthesized through one Cartesia WebSocket context — prosody carries
   * across sentences instead of resetting per chunk — and the stream is
   * s16le mono PCM rather than MP3. Falls back to the HTTP MP3 path if the
   * WS can't be established, reflected in the result's `audioFormat`.
   */
  pcmAudio?: boolean;
  /** Browser AudioContext rate; Cartesia emits matching PCM when supported. */
  pcmSampleRate?: number;
  /**
   * Interleave the answer's text tokens with the PCM audio as framed messages
   * (see src/lib/audio/answer-mux.ts). Only takes effect on the WS PCM path;
   * the client uses the live text for echo discrimination and captions.
   */
  muxText?: boolean;
  /** Browser/server correlation id for end-to-end voice timing. */
  turnId?: string | null;
}

export interface AnswerPipelineResult {
  /** Audio bytes for Kivo's answer (format per `audioFormat`). */
  audioStream: ReadableStream<Uint8Array>;
  /** "pcm" = raw mono PCM; otherwise MP3. */
  audioFormat: "mp3" | "pcm";
  /** True when the stream is the framed text+audio mux (PCM WS path only). */
  muxed: boolean;
  pcmSampleRate: number | null;
  pcmEncoding: typeof CARTESIA_PCM_ENCODING | null;
  ttsTransport: "cartesia-ws" | "cartesia-http";
  ttsFallbackReason: string | null;
  requestedModel: string;
  effectiveModel: string;
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

  const pipeline =
    input.pipeline ?? startAskPipeline(sessionId, question, input.turnId ?? null);
  const speakerLabel = speakerName ?? speaker ?? null;
  const askModel = input.askModel ?? DEFAULT_ASK_MODEL_ID;
  const requestedModel = getAskModelOption(askModel).apiModelId;
  const effectiveModel = resolveEffectiveAskModelOption(env, askModel);
  const modelUsed = effectiveModel.apiModelId;
  const intentToolkits = resolveConnectorToolkits(question);

  pipeline.stage("composio.intent", {
    toolkits: intentToolkits.join(",") || "none",
    requestedModel,
    effectiveModel: modelUsed,
  });

  // PCM-capable clients get one WS context per answer (prosody continuity).
  // Connect in parallel with the pre-LLM work; a failure quietly falls back
  // to the per-chunk HTTP MP3 path before response headers are decided.
  const wantPcm = (input.pcmAudio ?? false) && !framed && !input.onTtsSegment;
  const wsContextPromise = wantPcm
    ? createCartesiaContextStream(
        {
          apiKey: env.CARTESIA_API_KEY,
          modelId: env.CARTESIA_MODEL_ID,
          voiceId: input.voice?.voiceId || env.CARTESIA_VOICE_ID,
          sampleRate: input.pcmSampleRate,
        },
        signal
      )
        .then((ctx) => ({ ctx, fallbackReason: null as string | null }))
        .catch((err) => {
          const reason = err instanceof Error ? err.message : "connect_failed";
          console.warn(
            "[Ask] Cartesia WS unavailable — falling back to HTTP TTS:",
            err
          );
          pipeline.stage("tts.ws_fallback", { reason });
          return { ctx: null, fallbackReason: reason };
        })
    : Promise.resolve({ ctx: null, fallbackReason: null as string | null });

  const askStartedAt = performance.now();
  const authSessionMs = input.authSessionMs ?? 0;
  const speculative = input.speculative ?? false;

  // Persist the asked question exactly once, when audio is actually ready to
  // reach the client. That keeps failed LLM/TTS attempts out of the transcript,
  // so a client retry after a transient provider error cannot accumulate
  // duplicate user-question turns.
  let questionPersisted = false;
  const persistQuestionOnce = () => {
    if (questionPersisted) return;
    questionPersisted = true;
    void appendTurn(uid, sessionId, {
      role: "user_question",
      text: question,
      speaker,
      speakerName,
      // Keeps the question line correctable in the transcript like any other.
      providerSpeakerLabel: input.providerSpeakerLabel ?? null,
      sourceUtteranceIds: input.sourceUtteranceIds ?? [],
    })
      .then(() => pipeline.stage("persist.question", { ok: true }))
      .catch((err) => {
        console.error("[Ask] Failed to persist user question turn:", err);
        pipeline.stage("persist.question", { ok: false });
      });
  };
  if (speculative) pipeline.stage("speculative", { persist: "deferred" });

  // Tool-call events (e.g. web search starting) can fire before the audio
  // stream's controller exists — queue them and flush once it's ready, so the
  // client's "searching" signal never gets dropped on a timing race.
  type ToolEvent = { tool: string; phase: "started" | "completed" };
  const pendingToolEvents: ToolEvent[] = [];
  let onToolEventSink: ((event: ToolEvent) => void) | null = null;
  const handleToolEvent = (event: ToolEvent) => {
    if (onToolEventSink) onToolEventSink(event);
    else pendingToolEvents.push(event);
  };

  let textStream: ReadableStream<string>;
  let context: PrefetchedContextBundle;
  let contextBuildMs: number;
  let composioResult: Awaited<ReturnType<typeof loadComposioAgentTools>>;
  let composioMs: number;
  let preLlmMs: number;
  let agentStart: number;
  let agentReadyMs: number;
  let promptCacheReadTokens: number | null = null;

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
          tools: {} as Awaited<ReturnType<typeof loadComposioAgentTools>>["tools"],
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
      stableContext: context.stableContext,
      liveTranscript: context.liveTranscript,
      history: context.history,
      question: context.question,
      env,
      uid,
      signal,
      composioTools: composioResult.tools,
      pipeline,
      askModel,
      // Voice-identified asker (if any) is addressed as "you"; basic sessions
      // get the no-attribution variant of the system prompt.
      askerName: speakerName,
      speakerAware: session.transcriptionMode !== "basic",
      onToolEvent: handleToolEvent,
      onUsage: (usage) => {
        promptCacheReadTokens = usage.cachedInputTokens;
      },
    });
    agentReadyMs = performance.now() - agentStart;
    pipeline.stage("agent.ready", { ms: Math.round(agentReadyMs) });
  } catch (err) {
    setAskPipelineForComposio(undefined);
    void wsContextPromise.then(({ ctx }) => ctx?.abort());
    throw err;
  }

  const { ctx: wsCtx, fallbackReason: ttsFallbackReason } =
    await wsContextPromise;
  const audioFormat: "mp3" | "pcm" = wsCtx ? "pcm" : "mp3";
  const muxed = Boolean(wsCtx) && (input.muxText ?? false);

  let resolveDone!: (value: { answerText: string }) => void;
  const done = new Promise<{ answerText: string }>((resolve) => {
    resolveDone = resolve;
  });

  const audioStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      setAskPipelineForComposio(pipeline);
      let assistantText = "";

      // Search can start before TTS is wired up (the agent stream is already
      // running by then), so a hand-off requested that early is held and spoken
      // as soon as the chunk queue exists.
      let speakSearchFiller: (() => void) | null = null;
      let searchStartedBeforeTts = false;

      // Only the muxed WS-PCM path has a channel for out-of-band signals; on
      // every other path these are silently dropped and the client falls back
      // to the generic "thinking" state.
      onToolEventSink = (event) => {
        if (event.tool === WEB_SEARCH_TOOL_NAME && event.phase === "started") {
          if (speakSearchFiller) speakSearchFiller();
          else searchStartedBeforeTts = true;
        }
        if (!muxed || signal.aborted) return;
        try {
          controller.enqueue(
            encodeMuxEvent({
              type: event.phase === "started" ? "tool_started" : "tool_completed",
              tool: event.tool,
            })
          );
        } catch {
          // Stream already closed (client gone) — audio drain handles it.
        }
      };
      for (const event of pendingToolEvents.splice(0)) onToolEventSink(event);

      // Chunk texts whose audio fully reached the client — the best server-side
      // estimate of what was heard when an abort cuts the answer short.
      const spokenSegments: string[] = [];
      let pcmBytesStreamed = 0;

      // WS path streams one continuous PCM answer, so "what was spoken" maps
      // from streamed audio seconds back onto the text (~150 wpm ≈ 15 chars/s),
      // snapped to a word boundary.
      const estimatePcmSpokenText = () => {
        const seconds =
          pcmBytesStreamed /
          cartesiaPcmBytesPerSecond(wsCtx?.sampleRate ?? 24000);
        if (seconds < 0.4) return "";
        const full = assistantText.trim();
        const chars = Math.round(seconds * 15);
        if (chars >= full.length) return full;
        const cut = full.lastIndexOf(" ", chars);
        return (cut > 0 ? full.slice(0, cut) : full.slice(0, chars)).trim();
      };

      // A stopped answer must still exist in the transcript, holding only what
      // was actually spoken — otherwise the next ask sees a question Kivo
      // apparently never answered (or an answer nobody heard).
      //
      // Unless there is nothing in it. An answer cut off after two or three
      // words ("I'm", "What kinds of things") carries no claim anyone could
      // have heard; all it carries is the fact that it was cut off. Kept, it
      // shows up in the transcript as a run of one-word Kivo turns, and it
      // reaches the next prompt as a stack of "[The user cut this answer off
      // here.]" markers — which is what has Kivo opening turns by apologising
      // for being interrupted instead of answering. Dropped, the question
      // simply reads as not yet answered, which is what actually happened.
      const persistInterruptedAnswer = async () => {
        const spoken = wsCtx
          ? estimatePcmSpokenText()
          : spokenSegments.join(" ").trim();
        if (!spoken) return;
        if (countWords(spoken) < MIN_INTERRUPTED_ANSWER_WORDS) {
          pipeline.stage("persist.interrupted", {
            skipped: "too_short",
            chars: spoken.length,
          });
          return;
        }
        try {
          await appendTurn(uid, sessionId, {
            role: "assistant",
            text: spoken,
            interrupted: true,
          });
          pipeline.stage("persist.interrupted", { chars: spoken.length });
        } catch (persistErr) {
          console.error(
            "[Ask] Failed to persist interrupted answer:",
            persistErr
          );
        }
      };

      try {
        const streamStartedAt = performance.now();
        const ttsConfig = cartesiaConfig(env, input.voice);
        let llmFirstTokenMs: number | null = null;
        let llmTextDoneMs: number | null = null;
        let firstTtsEnqueueMs: number | null = null;
        let firstAudioByteMs: number | null = null;

        const ttsChunks: { text: string; index: number }[] = [];
        let chunkCount = 0;
        let textStreamDone = false;
        let searchFillerText: string | null = null;

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

        // Riding the same Cartesia context as the answer is what makes this
        // read as one continuous thought rather than a canned clip: same voice,
        // and prosody carries straight from the hand-off into the first
        // sentence. It is never spoken over an answer already in progress.
        speakSearchFiller = () => {
          if (searchFillerText || chunkCount > 0) return;
          searchFillerText =
            SEARCH_FILLER_PHRASES[
              Math.floor(Math.random() * SEARCH_FILLER_PHRASES.length)
            ];
          enqueueChunk(searchFillerText);
          // The mic hears this line come back through the speakers. Without it
          // on the text channel, echo discrimination reads Kivo's own hand-off
          // as someone interrupting and kills the answer before it starts.
          if (muxed && !signal.aborted) {
            try {
              controller.enqueue(encodeMuxText(`${searchFillerText} `));
            } catch {
              // Stream already closed (client gone) — audio drain handles it.
            }
          }
          pipeline.stage("search.filler", { chars: searchFillerText.length });
        };
        if (searchStartedBeforeTts) speakSearchFiller();

        // WS mode: one Cartesia context per answer. Text chunks are forwarded
        // as they land and audio comes back as a single continuous PCM stream —
        // prosody carries across sentences instead of resetting per chunk.
        const wsDrain = async () => {
          if (!wsCtx) return;
          const sender = (async () => {
            let sent = 0;
            while (true) {
              if (signal.aborted) {
                wsCtx.abort();
                return;
              }
              if (sent >= ttsChunks.length) {
                if (textStreamDone) break;
                await new Promise((r) => setTimeout(r, 10));
                continue;
              }
              wsCtx.sendText(ttsChunks[sent++].text);
            }
            wsCtx.finish();
          })();

          const reader = wsCtx.audio.getReader();
          while (true) {
            if (signal.aborted) return;
            const { done: rDone, value } = await reader.read();
            if (rDone) break;
            if (!value || value.length === 0) continue;
            pcmBytesStreamed += value.length;
            if (firstAudioByteMs == null) {
              firstAudioByteMs = performance.now() - askStartedAt;
              pipeline.stage("audio.first_byte", {
                ms: Math.round(firstAudioByteMs),
              });
              // Answer is now committed to being heard — safe to record the
              // question a deferred (speculative) ask held back. No-op otherwise.
              persistQuestionOnce();
            }
            controller.enqueue(muxed ? encodeMuxAudio(value) : value);
          }
          await sender;
        };

        // Cartesia free tier allows low concurrency (2). Playback consumes chunks
        // strictly in order, but synthesis of chunk n+1 starts while chunk n is
        // still streaming (lookahead of 1) so sentences butt up against each
        // other instead of leaving a synth-latency gap between them.
        const httpDrain = async () => {
          let drainPos = 0;
          let lookahead: Promise<ReadableStream<Uint8Array>> | null = null;
          const startSynth = (text: string) =>
            createCartesiaSpeechStream(ttsConfig, text, signal);
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
              stream = await (lookahead ?? startSynth(text));
            } catch (err) {
              if (isAbortError(err, signal)) return;
              throw err;
            }
            lookahead = null;
            if (drainPos < ttsChunks.length) {
              // Kick off the next chunk now; errors are re-surfaced when this
              // promise is awaited next iteration (the no-op catch just keeps
              // an early rejection from tripping unhandledRejection).
              const started = startSynth(ttsChunks[drainPos].text);
              started.catch(() => {});
              lookahead = started;
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
                  persistQuestionOnce();
                }
                // Default (browser/worker): stream raw MP3 bytes as they arrive so
                // MediaSource playback starts immediately. Framed mode (iOS) emits
                // one self-contained, length-prefixed MP3 segment per chunk below.
                if (!framed) controller.enqueue(value);
              }
            }
            // The search hand-off was spoken, but it isn't part of the answer —
            // keeping it out means an interrupted turn persists what Kivo
            // actually said rather than opening with "let me look that up".
            if (text !== searchFillerText) spokenSegments.push(text);
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
        };

        const drain = wsCtx ? wsDrain() : httpDrain();

        const reader = textStream.getReader();
        // Single-context WS synthesis keeps prosody across fragments, so it can
        // take word-level chunks for the lowest first-audio latency. The HTTP
        // path synthesizes each chunk as an isolated utterance and needs whole
        // sentences to sound acceptable.
        const phraseBuffer = wsCtx
          ? new WordStreamBuffer()
          : new VoicePhraseBuffer();

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
          if (muxed && !signal.aborted) {
            // Text rides ahead of its audio; the client uses it for echo
            // discrimination and live captions.
            try {
              controller.enqueue(encodeMuxText(value));
            } catch {
              // Stream already closed (client gone) — audio drain handles it.
            }
          }
          for (const phrase of phraseBuffer.push(value)) {
            enqueueChunk(phrase);
          }
        }

        for (const phrase of phraseBuffer.finish()) {
          enqueueChunk(phrase);
        }

        // Checked against the answer text, not the chunk count: a search
        // hand-off alone would otherwise pass for output and leave the room
        // with "let me look that up" and then silence.
        if (!assistantText.trim()) {
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
          await persistInterruptedAnswer();
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
          ttsTransport: wsCtx ? "cartesia-ws" : "cartesia-http",
          ttsFallbackReason,
          promptCacheReadTokens,
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
          await persistInterruptedAnswer();
          resolveDone({ answerText: assistantText.trim() });
          return;
        }
        if (isAbortError(err, signal)) {
          closeStreamOnAbort(controller, signal);
          await persistInterruptedAnswer();
          resolveDone({ answerText: assistantText.trim() });
          return;
        }
        // Mid-stream failure (TTS/LLM died): whatever already played is still
        // part of the conversation — keep the transcript truthful about it.
        await persistInterruptedAnswer();
        controller.error(err);
        resolveDone({ answerText: assistantText.trim() });
      } finally {
        setAskPipelineForComposio(undefined);
      }
    },
  });

  return {
    audioStream,
    audioFormat,
    muxed,
    pcmSampleRate: wsCtx?.sampleRate ?? null,
    pcmEncoding: wsCtx?.encoding ?? null,
    ttsTransport: wsCtx ? "cartesia-ws" : "cartesia-http",
    ttsFallbackReason,
    requestedModel,
    effectiveModel: modelUsed,
    done,
  };
}
