// Kivo meeting-bot worker.
//
// A long-lived Node process (deployed to Railway; NOT Vercel serverless). Recall
// opens a websocket to this server and pushes real-time transcript events for a
// bot that has joined a Zoom/Meet call. We turn those into the same wake-word /
// question-capture flow used in-person, then synthesize Kivo's answer and play it
// back into the call via Recall's Output Audio API.
//
// Run locally:  npm run worker   (loads .env.local if present)
// Deploy:       start command `npm run worker`, with all server env vars set.

import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

import { runAnswerPipeline } from "@/lib/aria/answer-pipeline";
import { buildContextBundle } from "@/lib/aria/context/build-context";
import { sanitizeQuestionText } from "@/lib/aria/context/question-text";
import {
  QuestionCaptureMachine,
  type CaptureStatus,
} from "@/lib/aria/conversation/question-capture-machine";
import { getCue, THINKING_PULSE_INTERVAL_MS, warmCues } from "./cues";
import { mp3DurationMs } from "./mp3-duration";
import { TranscriptTurnAssembler } from "@/lib/audio/turn-assembler";
import { getServerEnv } from "@/lib/env";
import { RecallClient } from "@/lib/recall/client";
import {
  parseRecallRealtimeMessage,
  type NormalizedTranscript,
} from "@/lib/recall/transcript-adapter";
import {
  appendTurn,
  getSession,
  setSessionBotState,
} from "@/lib/sessions/repository";
import { storePrefetchedContext } from "@/lib/sessions/context-prefetch-cache";
import type { SessionDoc, TurnDoc } from "@/lib/sessions/types";
import type { TranscriptUtterance } from "@/lib/types";

// Load .env.local for local runs (no-op on Railway where vars are injected).
try {
  (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(
    ".env.local"
  );
} catch {
  // No .env.local — rely on the real environment.
}

const PORT = Number(process.env.PORT ?? 8787);
const SPEAK_COOLDOWN_MS = 600;
// Audio feedback cues into the call (wake / thinking / error). Set
// RECALL_DISABLE_CUES=1 to silence them.
const CUES_ENABLED = process.env.RECALL_DISABLE_CUES !== "1";
// How long a speaker turn may sit buffered before we persist it, even if the
// speaker hasn't changed yet. Keeps the transcript appearing promptly instead of
// waiting for a speaker change / long pause to flush the assembler.
const TURN_IDLE_FLUSH_MS = 600;
// Bot mode: fast partial wake + short settle — accuracy lives in fuzzy matching.
const BOT_QUESTION_SETTLE_MS = 700;
const BOT_SPEECH_FINAL_SETTLE_MS = 350;
const CONTEXT_PREFETCH_DEBOUNCE_MS = 400;

const env = getServerEnv();
const recall = RecallClient.fromEnv(env);

/** Assigns a stable 0–9 speaker index per meeting participant. */
class SpeakerIndexer {
  private readonly map = new Map<string, number>();
  index(participantId: string): number {
    const existing = this.map.get(participantId);
    if (existing != null) return existing;
    const next = Math.min(this.map.size, 9);
    this.map.set(participantId, next);
    return next;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function drainStream(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

/** Per-connection bot session: owns the capture machine and turn persistence. */
class BotSession {
  private readonly speakers = new SpeakerIndexer();
  private readonly assembler = new TranscriptTurnAssembler();
  /** Stable utterance id for in-flight Recall partial streams per participant. */
  private readonly partialStreamIds = new Map<string, string>();
  private readonly machine: QuestionCaptureMachine;
  private botId: string | null = null;
  private speaking = false;
  private answering: AbortController | null = null;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private idleFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastStatus: CaptureStatus | null = null;
  private thinkingLoopTimer: ReturnType<typeof setInterval> | null = null;
  /** Serializes every Recall output_audio call — parallel posts overlap in the call. */
  private audioOutQueue: Promise<void> = Promise.resolve();
  /** Bumped to drop queued thinking/wake cues when answering starts. */
  private cueGeneration = 0;
  private contextPrefetchTimer: ReturnType<typeof setTimeout> | null = null;
  private contextPrefetchGeneration = 0;

  constructor(
    private readonly uid: string,
    private session: SessionDoc
  ) {
    this.machine = new QuestionCaptureMachine(
      {
        onResolveQuestion: (captured) => {
          void this.answer(
            captured.question,
            captured.speaker,
            captured.speakerName
          );
        },
        onStatus: (status) => {
          // Chirp into the call the moment the wake word lands, so everyone knows
          // Kivo is listening (mirrors the in-person wake cue).
          if (
            status === "capturing-question" &&
            this.lastStatus !== "capturing-question"
          ) {
            this.playCue("wake");
          }
          this.lastStatus = status;
        },
      },
      {
        wakeOnPartial: true,
        fuzzyWake: true,
        questionSettleMs: BOT_QUESTION_SETTLE_MS,
        speechFinalSettleMs: BOT_SPEECH_FINAL_SETTLE_MS,
      }
    );
  }

  private cancelQueuedCues(): void {
    this.cueGeneration += 1;
  }

  private enqueueMeetingAudio(
    b64: string,
    playbackMs: number,
    opts?: { cueGeneration?: number }
  ): void {
    const botId = this.botId;
    if (!botId) return;
    const cueGeneration = opts?.cueGeneration;
    this.audioOutQueue = this.audioOutQueue.then(async () => {
      if (cueGeneration != null && cueGeneration !== this.cueGeneration) return;
      try {
        await recall.outputAudio(botId, b64);
        await sleep(playbackMs);
      } catch (err) {
        console.error("[worker] meeting audio playback failed:", err);
      }
    });
  }

  private enqueueAnswerSegment(mp3: Uint8Array): Promise<void> {
    const botId = this.botId;
    if (!botId || mp3.length === 0) return Promise.resolve();
    const b64 = Buffer.from(mp3).toString("base64");
    // Recall's output_audio returns when the clip is *accepted*, not when it
    // finishes playing. Hold the queue for the clip's real duration so the next
    // segment can't start on top of this one — otherwise the answer plays as two
    // overlapping voices.
    const playbackMs = mp3DurationMs(mp3);
    let resolve!: () => void;
    const posted = new Promise<void>((r) => {
      resolve = r;
    });
    this.audioOutQueue = this.audioOutQueue
      .then(async () => {
        try {
          await recall.outputAudio(botId, b64);
        } catch (err) {
          console.error("[worker] answer segment playback failed:", err);
        } finally {
          // Unblock synthesis as soon as the audio is accepted so the next
          // segment can be prepared while this one plays...
          resolve();
        }
        // ...but keep the playback queue itself busy for the clip's length.
        await sleep(playbackMs);
      })
      .catch(() => resolve());
    return posted;
  }

  private async drainMeetingAudio(): Promise<void> {
    await this.audioOutQueue;
  }

  /** Play a short feedback cue into the meeting (queued, never overlaps). */
  private playCue(kind: "wake" | "thinking" | "error"): void {
    if (!CUES_ENABLED || !this.botId) return;
    const cueGeneration = this.cueGeneration;
    void getCue(kind)
      .then((cue) =>
        this.enqueueMeetingAudio(cue.b64, cue.playbackMs, { cueGeneration })
      )
      .catch((err) => console.error("[worker] cue build failed:", err));
  }

  /** Repeating cached vocal pulse while the answer generates (mirrors in-person). */
  private startThinkingLoop(): void {
    if (!CUES_ENABLED || !this.botId) return;
    this.stopThinkingLoop(false);
    const pulse = () => this.playCue("thinking");
    pulse();
    this.thinkingLoopTimer = setInterval(pulse, THINKING_PULSE_INTERVAL_MS);
  }

  private stopThinkingLoop(cancelPending = true): void {
    if (this.thinkingLoopTimer) {
      clearInterval(this.thinkingLoopTimer);
      this.thinkingLoopTimer = null;
    }
    if (cancelPending) this.cancelQueuedCues();
  }

  async ingest(message: unknown): Promise<void> {
    const parsed = parseRecallRealtimeMessage(message);
    if (!parsed) return;
    if (parsed.botId && !this.botId) {
      this.botId = parsed.botId;
      void setSessionBotState(this.uid, this.session.id, {
        botId: parsed.botId,
        botStatus: "live",
      }).catch(() => {});
    }
    // Ignore the meeting audio while Kivo is talking so it doesn't hear itself.
    if (this.speaking) return;

    const utterance = this.toUtterance(parsed);
    // Wake-word capture must never wait on Firestore writes.
    this.machine.handleUtterance(utterance);
    if (this.machine.isCapturingQuestion()) {
      this.scheduleContextPrefetch(this.machine.getQuestionDraft());
    }
    if (utterance.isFinal) {
      void this.persistSpeakerTurn(utterance);
    }
  }

  dispose(): void {
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    if (this.idleFlushTimer) clearTimeout(this.idleFlushTimer);
    this.clearContextPrefetch();
    this.stopThinkingLoop();
    this.answering?.abort();
    this.machine.dispose();
    void this.flushSpeakerTurn();
  }

  private toUtterance(parsed: NormalizedTranscript): TranscriptUtterance {
    const speaker = this.speakers.index(parsed.participantId);
    let id: string;
    if (parsed.isFinal) {
      this.partialStreamIds.delete(parsed.participantId);
      id = `${parsed.participantId}:${parsed.start}:${parsed.end}:f`;
    } else {
      let streamId = this.partialStreamIds.get(parsed.participantId);
      if (!streamId) {
        streamId = `${parsed.participantId}:${parsed.start}:p`;
        this.partialStreamIds.set(parsed.participantId, streamId);
      }
      id = streamId;
    }
    return {
      id,
      speaker,
      speakerName: parsed.participantName,
      providerSpeakerLabel: parsed.participantId,
      text: parsed.text,
      start: parsed.start,
      end: parsed.end,
      isFinal: parsed.isFinal,
      speechFinal: parsed.isFinal,
    };
  }

  private async persistSpeakerTurn(u: TranscriptUtterance): Promise<void> {
    const flushed = this.assembler.append(u);
    if (flushed) await this.writeTurn(flushed.utterance, flushed.sourceUtteranceIds);
    // Persist whatever is still buffered shortly after the speaker goes idle, so a
    // continuous talker shows up in the transcript without waiting for a turn change.
    this.scheduleIdleFlush();
  }

  private scheduleIdleFlush(): void {
    if (this.idleFlushTimer) clearTimeout(this.idleFlushTimer);
    this.idleFlushTimer = setTimeout(() => {
      this.idleFlushTimer = null;
      void this.flushSpeakerTurn();
    }, TURN_IDLE_FLUSH_MS);
  }

  private async flushSpeakerTurn(): Promise<void> {
    if (this.idleFlushTimer) {
      clearTimeout(this.idleFlushTimer);
      this.idleFlushTimer = null;
    }
    const flushed = this.assembler.flush();
    if (flushed) await this.writeTurn(flushed.utterance, flushed.sourceUtteranceIds);
  }

  private async writeTurn(
    u: TranscriptUtterance,
    sourceUtteranceIds: string[]
  ): Promise<void> {
    const text = u.text.trim();
    if (!text) return;
    try {
      await appendTurn(this.uid, this.session.id, {
        role: "speaker",
        text,
        speaker: u.speaker >= 0 ? u.speaker : null,
        speakerName: u.speakerName ?? null,
        sourceUtteranceIds,
      } satisfies Partial<TurnDoc> & { role: "speaker"; text: string });
    } catch (err) {
      console.error("[worker] failed to persist speaker turn:", err);
    }
  }

  private clearContextPrefetch(): void {
    this.contextPrefetchGeneration += 1;
    if (!this.contextPrefetchTimer) return;
    clearTimeout(this.contextPrefetchTimer);
    this.contextPrefetchTimer = null;
  }

  /** Pre-build ask context while the user finishes their question (in-person parity). */
  private scheduleContextPrefetch(draft: string): void {
    const question = sanitizeQuestionText(draft);
    if (!question) return;
    if (this.contextPrefetchTimer) {
      clearTimeout(this.contextPrefetchTimer);
      this.contextPrefetchTimer = null;
    }
    const generation = ++this.contextPrefetchGeneration;
    this.contextPrefetchTimer = setTimeout(() => {
      this.contextPrefetchTimer = null;
      if (generation !== this.contextPrefetchGeneration) return;
      void buildContextBundle({
        uid: this.uid,
        session: this.session,
        question,
      })
        .then((bundle) => storePrefetchedContext(this.session.id, question, bundle))
        .catch(() => {});
    }, CONTEXT_PREFETCH_DEBOUNCE_MS);
  }

  private async answer(
    question: string,
    speaker: number | null,
    speakerName: string | null
  ): Promise<void> {
    if (!this.botId) {
      console.warn("[worker] question resolved before botId was known; dropping");
      return;
    }
    // Flush any buffered transcript before answering so context is complete.
    await this.flushSpeakerTurn();

    this.speaking = true;
    this.machine.suspend();
    if (this.resumeTimer) clearTimeout(this.resumeTimer);

    this.startThinkingLoop();

    const controller = new AbortController();
    this.answering = controller;
    let firstSegment = true;

    try {
      const fresh = await getSession(this.uid, this.session.id);
      if (fresh) this.session = fresh;

      const { audioStream, done } = await runAnswerPipeline({
        uid: this.uid,
        session: this.session,
        question,
        speaker,
        speakerName,
        env,
        signal: controller.signal,
        onTtsSegment: async (mp3) => {
          if (firstSegment) {
            this.stopThinkingLoop();
            await this.drainMeetingAudio();
            firstSegment = false;
          }
          await this.enqueueAnswerSegment(mp3);
        },
      });

      await drainStream(audioStream);
      await done;
    } catch (err) {
      console.error("[worker] answer failed:", err);
      this.stopThinkingLoop();
      this.playCue("error");
    } finally {
      this.stopThinkingLoop();
      if (this.answering === controller) this.answering = null;
    }

    // Start listening again only once the audio we queued has *actually* finished
    // playing into the call. audioOutQueue is paced by each clip's real duration,
    // so draining it tells us precisely when Kivo went quiet. The old behavior
    // used a word-count estimate of speech length, which overshot Cartesia's real
    // pace and kept the mic muted for seconds after the answer — transcription
    // looked dead until the timer finally elapsed.
    await this.drainMeetingAudio();
    this.scheduleResume();
  }

  private scheduleResume(): void {
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = null;
      this.speaking = false;
      this.machine.resume();
      // No follow-up window in meeting mode: every question — including
      // follow-ups — must say "Kivo". (In a multi-person call a wake-word-free
      // window would grab anyone's next sentence as a question.)
    }, SPEAK_COOLDOWN_MS);
  }
}

function readConnectionParams(
  reqUrl: string | undefined
): { uid: string; sessionId: string } | null {
  if (!reqUrl) return null;
  const url = new URL(reqUrl, "http://localhost");
  const uid = url.searchParams.get("uid");
  const sessionId = url.searchParams.get("sessionId");
  if (!uid || !sessionId) return null;
  return { uid, sessionId };
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/health")) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: "/recall" });

wss.on("connection", async (ws: WebSocket, req) => {
  const params = readConnectionParams(req.url);
  if (!params) {
    ws.close(1008, "missing uid/sessionId");
    return;
  }

  const session = await getSession(params.uid, params.sessionId).catch(
    () => null
  );
  if (!session) {
    ws.close(1011, "session not found");
    return;
  }

  console.log(
    `[worker] Recall connected for session ${params.sessionId} (uid ${params.uid})`
  );
  void setSessionBotState(params.uid, params.sessionId, {
    botStatus: "live",
  }).catch(() => {});

  const bot = new BotSession(params.uid, session);

  ws.on("message", (raw) => {
    const text = raw.toString();
    if (process.env.RECALL_DEBUG) {
      console.log(`[worker] ← recall raw: ${text.slice(0, 800)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    void bot.ingest(parsed);
  });

  ws.on("close", () => {
    console.log(`[worker] Recall disconnected for session ${params.sessionId}`);
    bot.dispose();
    void setSessionBotState(params.uid, params.sessionId, {
      botStatus: "ended",
    }).catch(() => {});
  });

  ws.on("error", (err) => {
    console.error("[worker] websocket error:", err);
  });
});

server.listen(PORT, () => {
  console.log(`[worker] Kivo bot worker listening on :${PORT}`);
  // Pre-build feedback cues (wake/error phrases + cached thinking hum) so the
  // first wake word doesn't pay Cartesia latency mid-call.
  if (CUES_ENABLED) {
    void warmCues({
      apiKey: env.CARTESIA_API_KEY,
      modelId: env.CARTESIA_MODEL_ID,
      voiceId: env.CARTESIA_VOICE_ID,
    }).catch((err) =>
      console.error("[worker] failed to warm audio cues:", err)
    );
  }
});
