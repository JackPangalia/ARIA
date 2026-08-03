"use client";

import { MuxStreamDecoder } from "./answer-mux";
import { BargeInDetector } from "./barge-in-detector";
import { CueEngine } from "./cue-engine";
import { isBackchannelOnly, isLikelyEchoOfAnswer } from "./echo-matcher";
import { MicPcmStreamer } from "./mic-pcm-streamer";
import { PcmStreamPlayer } from "./pcm-stream-player";
import {
  SpeechActivityDetector,
  type LocalSpeechDetector,
} from "./speech-activity-detector";
import { SileroVadDetector } from "./silero-vad-detector";
import { SpeechmaticsLiveClient } from "./speechmatics-client";
import {
  VOICE_ENGINE_V2_ENABLED,
  VOICE_ENGINE_V2_TIMING,
} from "./voice-engine-config";
import { VoiceTurnController } from "./voice-turn-controller";
import { VoiceTurnTelemetry } from "./voice-turn-telemetry";
import {
  TranscriptTurnAssembler,
  type AssembledTranscriptTurn,
} from "./turn-assembler";
import { VisualMicLevelNormalizer } from "./visual-level";
import { track } from "@/lib/analytics/client";
import { devLog } from "@/lib/client/dev-log";
import {
  askSessionQuestion,
  appendSessionTurn,
  finalizeSessionTitle,
  prefetchSessionContext,
  relabelSessionTurns,
  reportAnswerInterrupted,
} from "@/lib/sessions/client";
import { listSpeakerProfiles } from "@/lib/speakers/client";
import type { SpeakerProfileDoc } from "@/lib/speakers/types";
import { sendHeartbeat } from "@/lib/plan/client";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/plan/tiers";
import {
  questionsMatchForContext,
  sanitizeQuestionText,
} from "@/lib/aria/context/question-text";
import {
  detectCloseWord,
  detectStopWord,
  detectTrailingStop,
  extractQuestionAfterWakeInPerson,
  isSubstantiveQuestion,
  CONVERSATION_WINDOW_MS,
  QUESTION_SETTLE_MS,
} from "@/lib/aria/conversation/wake";
import {
  assessQuestionCompleteness,
  END_OF_UTTERANCE_GRACE_MS,
  LOCAL_SPEECH_END_SETTLE_MS,
  SETTLE_MS,
} from "@/lib/aria/conversation/endpointing";
import { joinText } from "@/lib/text/join-text";
import { useAriaStore } from "@/lib/store";
import type { TranscriptionMode } from "@/lib/sessions/types";
import type { AriaStatus, TranscriptUtterance } from "@/lib/types";

const PLAYBACK_STT_COOLDOWN_MS = 300;
// Once somebody accepts the wake-free follow-up window, transcript/provider
// edge cases must not strand Kivo in capture forever. Refreshed whenever
// meaningful transcript text arrives; normal semantic endpointing resolves
// much sooner.
const FOLLOW_UP_CAPTURE_TIMEOUT_MS = 6_000;
// Barge-in ducking: how far to drop the answer volume the moment we suspect
// the user is talking over Kivo, and how fast to ramp there / back.
const DUCK_GAIN = 0.15;
const DUCK_RAMP_S = 0.06;
// Extra rewind (s) added to the detected barge-in onset when closing the echo
// window. The detector only confirms after a sustained run, so the user has
// already been speaking for a beat — rewind generously so none of their
// opening words stay inside the (now-closed) echo window and get dropped.
const BARGE_IN_ONSET_MARGIN_S = 0.3;
const ASSISTANT_COMMAND_MAX_WORDS = 5;
const TURN_IDLE_FLUSH_MS = 1800;
const CONTEXT_PREFETCH_DEBOUNCE_MS = 400;
// Server-side AskBodySchema limits. A marathon monologue capture must degrade
// (keep the tail, where the actual ask lives) rather than 400 the whole turn.
const ASK_QUESTION_MAX_CHARS = 12000;
const ASK_SOURCE_IDS_MAX = 400;

function pcmLevel(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i] / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / pcm.length);
}

function wordCount(text: string): number {
  return text.match(/[a-zA-Z0-9']+/g)?.length ?? 0;
}

// iOS (iPhone/iPad) and iPadOS-on-Mac all run WebKit, which blocks
// HTMLAudioElement.play() unless it happens inside a live user gesture. The
// spoken answer arrives asynchronously (after STT -> LLM -> TTS), so on these
// platforms we route playback through the already-unlocked AudioContext instead.
function isIOSWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const touchMac =
    navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
  return /iPad|iPhone|iPod/.test(ua) || touchMac;
}

export type AriaEngineOptions = {
  sessionId: string;
  transcriptionMode: TranscriptionMode;
  onSessionActivity?: () => void;
  /** Called when the listening budget runs out mid-session (engine auto-stops). */
  onUsageExhausted?: () => void;
};

// One engine runs at a time (Controls enforces it); registering the live
// instance lets UI outside the Controls tree — the transcript panel's speaker
// correction — reach it without threading refs through the workspace.
let activeAriaEngine: AriaEngine | null = null;

export function getActiveAriaEngine(): AriaEngine | null {
  return activeAriaEngine;
}

export class AriaEngine {
  private sessionId: string;
  private transcriptionMode: TranscriptionMode;
  private onSessionActivity?: () => void;
  private persistedUtteranceIds = new Set<string>();
  private stt: SpeechmaticsLiveClient | null = null;
  private mic: MicPcmStreamer | null = null;
  private capturingQuestion = false;
  private questionUtterances: TranscriptUtterance[] = [];
  /** Latest in-flight partial while capturing — the freshest text available
   * for the semantic fast path, since finals lag partials by up to max_delay. */
  private capturePartial = "";
  /** One ForceEndOfUtterance per voiced segment; reset on speech onset. */
  private endpointForced = false;
  private wakeUtteranceId: string | null = null;
  private wakeSpeaker: number | null = null;
  private wakeSpeakerName: string | null = null;
  private wakeProviderSpeakerLabel: string | null = null;
  private inlineQuestion = "";
  private questionSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private contextPrefetchTimer: ReturnType<typeof setTimeout> | null = null;
  private contextPrefetchGeneration = 0;
  private followUpTimer: ReturnType<typeof setTimeout> | null = null;
  private followUpStartTimer: ReturnType<typeof setTimeout> | null = null;
  private followUpListening = false;
  private followUpCaptureTimer: ReturnType<typeof setTimeout> | null = null;
  private capturingFollowUp = false;
  private captureWholeAnchorUtterance = false;
  private activeFetchAbort: AbortController | null = null;
  /**
   * An answer request fired *before* the endpoint was confirmed, to pre-warm
   * the server/LLM/TTS during the STT-finalization + endpoint-grace window. Its
   * response is held (never played) until `askAria` either adopts it — when the
   * confirmed question matches — or discards it. Only one is ever in flight per
   * voiced segment. See `startSpeculativeAsk`.
   */
  private speculativeAsk: {
    question: string;
    controller: AbortController;
    responsePromise: Promise<Response>;
    clientT0: number;
  } | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  private currentClipStop: (() => void) | null = null;
  /** Live raw-PCM answer playback (Web Audio path) — null when idle or on MP3 paths. */
  private pcmPlayback: {
    ctx: AudioContext;
    startedAt: number | null;
    playhead: number;
    sources: Set<AudioBufferSourceNode>;
    endTimer: ReturnType<typeof setTimeout> | null;
    streamDone: boolean;
  } | null = null;
  private pcmStreamPlayer: PcmStreamPlayer | null = null;
  private playbackGeneration = 0;
  private cues = new CueEngine();
  private bargeIn: BargeInDetector;
  /** Dedicated gain node for raw-PCM answer playback, so barge-in ducking can
   * drop the answer volume without touching the shared cue/master gain. */
  private answerGain: GainNode | null = null;
  private ducked = false;
  private isAssistantSpeaking = false;
  private suppressSttUntilMs = 0;
  private turnAssembler = new TranscriptTurnAssembler();
  private turnFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private onUsageExhausted?: () => void;
  private titleFinalized = false;
  private visualMicLevel = new VisualMicLevelNormalizer();
  // Neural VAD (Silero) with an internal RMS fallback until its model loads, or
  // permanently if it can't. Swapped in on start(); reset()/process() are
  // interface-compatible with the plain RMS detector.
  private localSpeechDetector: LocalSpeechDetector = new SpeechActivityDetector();
  private localSpeechActive = false;
  private localSpeechLastPositiveMs = 0;
  private enrolledProfiles: SpeakerProfileDoc[] = [];
  /** Kivo's answer text as it streams (mux path). This is what lets the engine
   * tell its own echo from a person talking over it — the basis of reliable
   * just-start-talking barge-in. Reset at each ask, kept through the echo tail. */
  private liveAnswerText = "";
  // Persisted speaker-turn ids per provider label, scoped to the current
  // recognition stream (cleared on every stream open). This is the relabel
  // target set when the user corrects a misattributed speaker — earlier
  // streams' turns under the same label were attributed by different clusters
  // and are deliberately left alone.
  private streamTurnIdsByLabel = new Map<string, string[]>();
  private currentTurnTelemetry: VoiceTurnTelemetry | null = null;
  private readonly voiceEngineV2 = VOICE_ENGINE_V2_ENABLED;
  private readonly turnController = new VoiceTurnController({
    onPhaseChange: (phase, previous) =>
      devLog("voice-state", `${previous} → ${phase}`),
  });

  constructor(options: AriaEngineOptions) {
    this.sessionId = options.sessionId;
    this.transcriptionMode = options.transcriptionMode;
    this.onSessionActivity = options.onSessionActivity;
    this.onUsageExhausted = options.onUsageExhausted;
    this.bargeIn = new BargeInDetector(
      {
        onSuspected: (info) => {
          this.currentTurnTelemetry?.mark("barge_in_suspected", {
            duckMs: Math.round(info.onsetSecondsAgo * 1000),
          });
          this.duckPlayback();
        },
        onConfirmed: (info) => this.handleAcousticBargeIn(info),
        onEnded: () => this.unduckPlayback(),
      },
      this.voiceEngineV2
        ? {
            duckMs: VOICE_ENGINE_V2_TIMING.duckMs,
            confirmMs: VOICE_ENGINE_V2_TIMING.confirmMs,
            primeMs: VOICE_ENGINE_V2_TIMING.primeMs,
          }
        : {}
    );
  }

  async start() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- module-level active-instance registry, not a this-alias
    activeAriaEngine = this;
    const store = useAriaStore.getState();
    store.clearTranscript();
    this.visualMicLevel.reset();
    store.setError(null);
    store.setStatus("listening");
    this.turnController.transition("listening");

    devLog("session", "Mic session started — transcript lines print here in dev.");

    try {
      await this.cues.ensureReady();
      // Neural VAD loads in parallel with STT connect; process() uses its RMS
      // fallback until the model is ready (or permanently if it never loads).
      const silero = new SileroVadDetector();
      this.localSpeechDetector = silero;
      void silero.init();
      const profileCount = await this.connectStt();
      this.mic = new MicPcmStreamer({
        voiceIdentification:
          this.transcriptionMode === "speaker" && profileCount > 0,
        continuousEchoCancellation: this.voiceEngineV2,
      });
      await this.mic.start((frame) => {
        const visualLevel = this.visualMicLevel.update(pcmLevel(frame));
        useAriaStore.getState().setMicLevel(visualLevel);
        this.observeLocalSpeech(frame);
        // Watch for the user talking over Kivo. The detector only reacts while
        // it's been started (during playback); it's a no-op otherwise.
        this.bargeIn.process(frame);
        if (this.shouldSendMicToStt()) {
          this.stt?.sendPcm(frame);
        }
      });
      this.startHeartbeat();
      // A backgrounded tab can lose the STT socket without a reconnectable
      // close firing while throttled; retry immediately on return.
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      this.cues.playError();
      useAriaStore.getState().setError(msg);
      await this.stop();
    }
  }

  private async connectStt(): Promise<number> {
    const profiles =
      this.transcriptionMode === "speaker"
        ? await listSpeakerProfiles().catch((err) => {
            devLog(
              "speaker",
              `Could not load saved speaker profiles: ${
                err instanceof Error ? err.message : "unknown error"
              }`
            );
            throw new Error(
              "Could not load saved speaker profiles. Try restarting Kivo."
            );
          })
        : [];

    this.enrolledProfiles = profiles;
    this.stt = new SpeechmaticsLiveClient({
      onOpen: () => {
        // A fresh stream means fresh diarization clusters — turns persisted
        // under the previous stream's labels are no longer correction targets.
        this.streamTurnIdsByLabel.clear();
        useAriaStore.getState().setNotice(null);
      },
      onClose: () => {
        /* noop */
      },
      onReconnecting: (attempt) => {
        devLog("speechmatics", `Reconnecting (attempt ${attempt}).`);
        useAriaStore.getState().setNotice("Reconnecting…");
      },
      onError: (err) => {
        devLog("speechmatics", err.message);
        useAriaStore.getState().setNotice(null);
        useAriaStore.getState().setError(err.message);
      },
      onUtterance: (u) => this.handleUtterance(u),
      onUtteranceEnd: () => this.handleUtteranceEnd(),
    }, profiles, {
      transcriptionMode: this.transcriptionMode,
      voiceEngineV2: this.voiceEngineV2,
    });

    await this.stt.connect();
    return profiles.length;
  }

  async stop() {
    this.currentTurnTelemetry?.finish("aborted", { reason: "session_stop" });
    this.currentTurnTelemetry = null;
    this.localSpeechDetector.reset();
    this.localSpeechActive = false;
    this.turnController.invalidate("idle");
    if (activeAriaEngine === this) {
      activeAriaEngine = null;
    }
    this.stopHeartbeat();
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    await this.mic?.stop();
    this.mic = null;
    if (this.stt) {
      this.stt.close();
      this.stt = null;
    }
    useAriaStore.getState().setNotice(null);
    this.resetQuestionCapture();
    this.stopFollowUpWindow();
    this.clearFollowUpStartTimer();
    this.clearTurnFlushTimer();
    void this.flushPersistedSpeakerTurn().then(() => this.finalizeTitle());
    this.abortActiveFetch();
    this.stopPlayback();
    this.cues.stopWorkCue();
    void this.cues.dispose();
    this.visualMicLevel.reset();
    useAriaStore.getState().setMicLevel(0);
    useAriaStore.getState().setStatus("idle");
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      this.stt?.reconnectNow();
    }
  };

  private finalizeTitle() {
    // Once per session: regenerate the sidebar title from the whole
    // conversation now that it has ended.
    if (this.titleFinalized) return;
    this.titleFinalized = true;
    void finalizeSessionTitle(this.sessionId);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    // Fire one immediately to establish the baseline, then on a fixed interval.
    void this.sendListeningHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.sendListeningHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private async sendListeningHeartbeat() {
    try {
      const result = await sendHeartbeat(this.sessionId);
      if (result.stop) {
        await this.stop();
        useAriaStore
          .getState()
          .setError("You've used all your listening time this month. Upgrade to keep listening.");
        this.onUsageExhausted?.();
      }
    } catch {
      // Best-effort — a failed heartbeat must not interrupt listening.
    }
  }

  private shouldSendMicToStt(): boolean {
    // Keep STT live during playback so short spoken commands can interrupt Kivo.
    // Echo/self-hearing is filtered in handleAssistantCommandUtterance before
    // it can hit the transcript or question-capture paths.
    return Date.now() >= this.suppressSttUntilMs;
  }

  private observeLocalSpeech(frame: Int16Array): void {
    const activity = this.localSpeechDetector.process(frame);
    const now = performance.now();
    if (activity.probability >= 0.42) {
      this.localSpeechLastPositiveMs = now;
      if (!this.localSpeechActive) {
        this.localSpeechActive = true;
        if (this.capturingQuestion) {
          this.currentTurnTelemetry?.mark("speech_onset", {
            probability: activity.probability,
          });
          // A new voiced segment can be forced to an endpoint again later.
          this.endpointForced = false;
          // The speaker resumed — any answer speculated on the previous
          // (now-stale) draft must be torn down before it wastes an LLM call or
          // races the corrected question.
          this.abortSpeculativeAsk("speech_resumed");
          // The speaker resumed while a dispatch was pending — they weren't
          // done. Hold the send; the next transcript/end-of-turn (or the
          // speech-end fallback below) re-arms it.
          if (this.questionSettleTimer) {
            this.currentTurnTelemetry?.mark("settle_hold");
            devLog("wake", "Speech resumed — holding dispatch.");
            this.clearQuestionSettleTimer();
          }
        }
      }
      return;
    }

    if (
      this.localSpeechActive &&
      now - this.localSpeechLastPositiveMs >= 160
    ) {
      this.localSpeechActive = false;
      if (this.capturingQuestion) {
        this.currentTurnTelemetry?.mark("speech_end", {
          probability: activity.probability,
        });
        this.turnController.transition("endpointing");
        this.maybeForceEndpoint();
        // Safety net for the hold above: if the resumed speech produced no
        // transcript (a breath, a cough), nothing would re-arm dispatch —
        // re-arm here; a real transcript event supersedes this immediately.
        if (
          !this.questionSettleTimer &&
          this.getCapturedQuestion().question.length > 0
        ) {
          this.scheduleQuestionResolution(LOCAL_SPEECH_END_SETTLE_MS, {
            prefetch: false,
          });
        }
      }
    }
  }

  private shouldIgnoreIncomingUtterance(): boolean {
    return !this.shouldSendMicToStt();
  }

  /**
   * Semantic fast path (two-stage endpointing): the local VAD heard the voice
   * stop. If everything heard so far — settled finals plus the freshest
   * partial — already reads like a completed ask, tell Speechmatics to
   * finalize now instead of waiting out the server's silence trigger. This
   * only accelerates *transcription*: dispatch still goes through the graded
   * grace on the punctuated final, so a wrong force can never cut anyone off —
   * worst case an utterance is split in two and capture keeps accumulating.
   */
  private maybeForceEndpoint() {
    if (this.endpointForced || !this.capturingQuestion) return;
    const draft = joinText(
      this.getCapturedQuestion().question,
      this.capturePartial
    );
    if (!draft.trim()) return;
    const completeness = assessQuestionCompleteness(draft);
    if (completeness !== "clear-ask" && completeness !== "likely-ask") return;
    this.endpointForced = true;
    this.currentTurnTelemetry?.mark("endpoint_forced", { completeness });
    devLog("wake", `Voice stopped, draft reads ${completeness} — forcing endpoint.`);
    this.stt?.forceEndOfUtterance();
    // Only a *clear* ask (terminal "?" or directive) is complete enough to
    // answer speculatively: fire the request now so the LLM/TTS runs during the
    // STT-finalization + grace window. Playback still waits for the endpoint to
    // confirm (askAria adopts this in-flight request), so a wrong guess is
    // silently discarded, never spoken. Likely-asks only get the faster
    // transcription above — not the speculative dispatch.
    if (completeness === "clear-ask") {
      this.startSpeculativeAsk(draft);
    }
  }

  /**
   * Fire the answer request for a provably-complete (clear-ask) draft *before*
   * the endpoint is confirmed. The server runs context → LLM → TTS immediately,
   * so by the time the endpoint grace elapses and `askAria` adopts this request,
   * the first audio is already on its way — hiding the LLM/TTS time-to-first-
   * audio behind the endpoint window. The response is held, not played.
   *
   * Speculative requests carry `X-Kivo-Speculative`, so the server defers the
   * question-turn persistence to the first audio byte: a discarded speculation
   * (aborted on speech-resume / reset / supersede) leaves no transcript trace.
   */
  private startSpeculativeAsk(draft: string): void {
    if (this.speculativeAsk) return; // one in flight per voiced segment
    const question = sanitizeQuestionText(draft);
    if (!question || !isSubstantiveQuestion(question)) return;
    const captured = this.getCapturedQuestion();
    const controller = new AbortController();
    const telemetry = this.currentTurnTelemetry;
    const clientT0 = performance.now();
    telemetry?.mark("speculation_start", { chars: question.length });
    devLog("pipeline", "speculative_start", { chars: question.length });

    const responsePromise = (async () => {
      const pcmContext =
        this.supportsPcmPlayback() && this.voiceEngineV2
          ? await this.cues.getPlaybackContext()
          : null;
      return askSessionQuestion(
        this.sessionId,
        question,
        captured.speaker,
        captured.speakerName,
        controller.signal,
        captured.sourceUtteranceIds,
        {
          acceptPcm: this.supportsPcmPlayback(),
          acceptMuxText: this.supportsPcmPlayback(),
          pcmSampleRate: pcmContext?.ctx.sampleRate,
          turnId: telemetry?.turnId,
          speculative: true,
        }
      );
    })();
    // The discard path aborts without awaiting — swallow the resulting
    // rejection so it never surfaces as an unhandled promise rejection.
    responsePromise.catch(() => {});
    this.speculativeAsk = { question, controller, responsePromise, clientT0 };
  }

  /**
   * Claim an in-flight speculation for a now-confirmed question. Returns the
   * held request if its draft matches (adopt — play it, no second round trip),
   * otherwise aborts it and returns null (discard — `askAria` issues a fresh
   * request for the corrected question).
   */
  private takeMatchingSpeculation(
    question: string
  ): { controller: AbortController; responsePromise: Promise<Response>; clientT0: number } | null {
    const spec = this.speculativeAsk;
    if (!spec) return null;
    this.speculativeAsk = null;
    if (questionsMatchForContext(spec.question, question)) {
      this.currentTurnTelemetry?.mark("speculation_adopted");
      devLog("pipeline", "speculative_adopted");
      return spec;
    }
    this.currentTurnTelemetry?.mark("speculation_discarded", {
      reason: "mismatch",
    });
    devLog("pipeline", "speculative_discarded", { reason: "mismatch" });
    try {
      spec.controller.abort();
    } catch {
      // already settled
    }
    return null;
  }

  /** Tear down any pending speculation (speaker resumed, turn reset, or a new
   * turn superseded this one) so nothing is left streaming to be discarded. */
  private abortSpeculativeAsk(reason = "aborted"): void {
    const spec = this.speculativeAsk;
    if (!spec) return;
    this.speculativeAsk = null;
    this.currentTurnTelemetry?.mark("speculation_discarded", { reason });
    try {
      spec.controller.abort();
    } catch {
      // already settled
    }
  }

  private handleUtterance(u: TranscriptUtterance) {
    if (this.shouldIgnoreIncomingUtterance()) {
      return;
    }

    const wake = extractQuestionAfterWakeInPerson(u.text);
    const utteranceStable = u.speechFinal || u.isFinal;
    const store = useAriaStore.getState();
    if (utteranceStable && this.capturingQuestion) {
      this.currentTurnTelemetry?.mark("speech_final", {
        chars: u.text.length,
      });
    }

    // An utterance overlapping a known assistant-speech interval on the audio
    // timeline is *suspected* echo — Kivo's own voice picked up by the mic.
    // Timing alone can't distinguish echo from a person talking over the
    // answer, so the content decides: text matching the live answer is echo
    // and dropped (it must never read as a command, or Kivo's own
    // "thanks"/"stop"/"that's enough" would silence itself); anything else is
    // a human and flows into the command/barge-in path below.
    if (u.overlapsAssistantSpeech && this.isOwnEcho(u.text)) {
      return;
    }

    // While thinking or speaking, a genuine (non-echo) user utterance either
    // issues an explicit stop/close/wake command or — while Kivo is audibly
    // speaking — interrupts outright, Claude-style: just start talking. The
    // acoustic barge-in detector still ducks/interrupts faster when AEC gives
    // it a clean signal; this transcript path is the reliable backstop.
    if (this.shouldUseAssistantCommandPath(store.status)) {
      this.handleAssistantCommandUtterance(u, wake.detected, utteranceStable);
      return;
    }

    // "Thank you, Kivo" ends the conversation outside active playback. During
    // playback/thinking, or on audio flagged as Kivo's own echo, the stricter
    // command-only path above handles it.
    if (utteranceStable && detectCloseWord(u.text)) {
      this.handleClose();
      return;
    }

    if (
      utteranceStable &&
      this.followUpListening &&
      this.isStopCommand(u.text)
    ) {
      this.handleStopCommand();
      return;
    }

    useAriaStore.getState().upsertUtterance(u);
    if (u.isFinal) {
      const speakerLabel = u.speakerName ?? `Speaker ${u.speaker + 1}`;
      devLog(
        "utterance",
        `${speakerLabel}: ${u.text}`,
        { speaker: u.speaker, speakerName: u.speakerName ?? null }
      );
    }

    // Utterances that are (or become) part of question capture are never
    // persisted as a speaker turn — the server already persists the resolved
    // question as its own turn, and persisting the raw utterance too would
    // duplicate it in the transcript.
    const willEnterCapture =
      wake.detected ||
      (utteranceStable && this.followUpListening && u.text.trim().length > 0);
    const isQuestionCaptureUtterance = this.capturingQuestion || willEnterCapture;

    if (u.isFinal && u.speechFinal && !isQuestionCaptureUtterance) {
      void this.bufferSpeakerTurn(u);
    }

    if (!this.capturingQuestion) {
      if (wake.detected) {
        this.handleWake(
          u.id,
          u.speaker,
          u.speakerName ?? null,
          u.providerSpeakerLabel ?? null
        );
      } else if (
        utteranceStable &&
        this.followUpListening &&
        u.text.trim().length > 0
      ) {
        this.handleFollowUp(
          u.id,
          u.speaker,
          u.speakerName ?? null,
          u.providerSpeakerLabel ?? null
        );
      }
    }

    if (!this.capturingQuestion) return;

    if (this.capturingFollowUp && u.text.trim()) {
      this.scheduleFollowUpCaptureTimeout();
    }

    // Track the freshest partial for the semantic fast path; a stable
    // utterance supersedes it (its text lands in the settled draft below).
    if (!utteranceStable) {
      this.capturePartial = wake.detected ? wake.question : u.text.trim();
    } else {
      this.capturePartial = "";
    }

    if (this.wakeUtteranceId === u.id) {
      if (utteranceStable && wake.detected) {
        this.inlineQuestion = wake.question;
      } else if (utteranceStable && this.captureWholeAnchorUtterance) {
        this.inlineQuestion = u.text.trim();
      }
      if (this.inlineQuestion) {
        this.scheduleQuestionResolution(
          this.settleDelayForDraft(u.speechFinal)
        );
      }
      return;
    }

    if (utteranceStable) {
      this.upsertQuestionUtterance({
        ...u,
        text: wake.detected ? wake.question : u.text,
      });
      if (this.getCapturedQuestion().question.length > 0) {
        this.scheduleQuestionResolution(
          this.settleDelayForDraft(u.speechFinal)
        );
      }
    }
  }

  private shouldUseAssistantCommandPath(status: AriaStatus): boolean {
    return status === "speaking" || status === "thinking" || status === "searching";
  }

  private isStopCommand(text: string): boolean {
    // Short whole-utterance stop phrases ("stop", "shut up"). Echo is now
    // identified by audio timing (overlapsAssistantSpeech), not by requiring
    // the wake word, so bare stop words work the same in every transcription
    // mode.
    if (wordCount(text) <= ASSISTANT_COMMAND_MAX_WORDS && detectStopWord(text)) {
      return true;
    }
    // The trailing clause covers utterances where Kivo's echo merged with
    // real speech into one long final (e.g. "...goal of the app. Stop.") —
    // the word-count cap only applies to the whole-utterance check above.
    return detectTrailingStop(text);
  }

  private isWakeOnlyCommand(text: string, wakeDetected: boolean): boolean {
    if (!wakeDetected || wordCount(text) > ASSISTANT_COMMAND_MAX_WORDS) {
      return false;
    }
    return extractQuestionAfterWakeInPerson(text).question.length === 0;
  }

  /** True when this utterance reads like a fragment of the answer currently
   * (or just) playing — Kivo hearing itself through the speakers. Without live
   * answer text (MP3 fallback paths) there is nothing to compare against, so
   * overlapping audio keeps the old always-echo treatment. */
  private isOwnEcho(text: string): boolean {
    if (!this.liveAnswerText) return true;
    return isLikelyEchoOfAnswer(text, this.recentlySpokenAnswerText());
  }

  /** The slice of the answer that has actually left the speakers recently.
   * Echo can only be of audio already played, so matching against this window
   * — estimated from the playback clock at ~15 chars/s with generous slack —
   * keeps a word Kivo said long ago (or hasn't spoken yet) from condemning a
   * short real interruption like "stop" as echo. */
  private recentlySpokenAnswerText(): string {
    const played = this.pcmStreamPlayer?.playbackSeconds;
    if (played == null || played <= 0) return this.liveAnswerText;
    const spokenChars = Math.round((played + 2) * 15);
    const spoken = this.liveAnswerText.slice(0, spokenChars);
    // Keep roughly the last ten seconds of speech as the match window.
    return spoken.slice(-160);
  }

  private handleAssistantCommandUtterance(
    u: TranscriptUtterance,
    wakeDetected: boolean,
    utteranceStable: boolean
  ) {
    // Unambiguous stop phrases act on partials — no waiting for endpointing.
    if (this.isStopCommand(u.text)) {
      this.handleStopCommand();
      return;
    }

    if (utteranceStable && detectCloseWord(u.text)) {
      this.handleClose();
      return;
    }

    if (utteranceStable && this.isWakeOnlyCommand(u.text, wakeDetected)) {
      this.handleWake(
        u.id,
        u.speaker,
        u.speakerName ?? null,
        u.providerSpeakerLabel ?? null
      );
      return;
    }

    // Claude-style barge-in: sustained real speech while Kivo is audibly
    // speaking stops the answer and becomes the next question. Deliberately
    // NOT applied while thinking — the room keeps talking after asking, and
    // ambient conversation must not cancel an answer nothing is playing over.
    if (useAriaStore.getState().status !== "speaking") return;
    // Listener acknowledgments ("yeah exactly", "makes sense") ride under the
    // answer without meaning "stop talking".
    if (isBackchannelOnly(u.text)) return;
    const words = wordCount(u.text);
    // Evidence fusion for speed: alone, a partial needs three words before it
    // outweighs the risk of room chatter. But if the acoustic detector is
    // already suspicious (`ducked` — sustained voiced energy over the answer),
    // the two weak signals corroborate each other and the very first non-echo
    // word confirms the interruption.
    const partialThreshold = this.ducked ? 1 : 3;
    if (utteranceStable ? words >= 2 : words >= partialThreshold) {
      this.handleTranscriptBargeIn(u, wakeDetected, utteranceStable);
    }
  }

  /**
   * STT-confirmed barge-in: a non-echo utterance while the answer plays. This
   * survives weak echo cancellation and quiet talkers — the cases where the
   * acoustic detector goes deaf — at the cost of STT latency, so the two run
   * layered: acoustic ducks/interrupts fast when it can, this always catches up.
   */
  private handleTranscriptBargeIn(
    u: TranscriptUtterance,
    wakeDetected: boolean,
    utteranceStable: boolean
  ) {
    this.currentTurnTelemetry?.mark("barge_in_confirmed", {
      from: "transcript",
      stable: utteranceStable,
    });
    this.turnController.interrupt();
    this.bargeIn.stop();
    this.ducked = false;
    devLog("wake", "Speech over playback — stopping answer and capturing.");
    this.reportPlaybackInterruption();
    if (this.isAssistantSpeaking) {
      // Rewind the echo window to before this utterance began so the rest of
      // the interruption transcribes clean instead of arriving echo-flagged.
      this.stt?.markAssistantSpeechEnd({
        onsetBackoffSeconds:
          Math.max(0, u.end - u.start) + BARGE_IN_ONSET_MARGIN_S,
      });
    }
    this.stopPlayback();
    this.abortActiveFetch();
    this.currentTurnTelemetry?.finish("aborted", { reason: "barge_in" });
    this.currentTurnTelemetry = null;
    this.cues.stopWorkCue();
    // Keep the mic live (skip the post-playback cooldown) so the rest of the
    // interruption reaches STT immediately.
    this.suppressSttUntilMs = 0;

    const wake = wakeDetected ? extractQuestionAfterWakeInPerson(u.text) : null;
    if (wakeDetected) {
      this.handleWake(
        u.id,
        u.speaker,
        u.speakerName ?? null,
        u.providerSpeakerLabel ?? null
      );
    } else {
      this.handleFollowUp(
        u.id,
        u.speaker,
        u.speakerName ?? null,
        u.providerSpeakerLabel ?? null
      );
    }

    // A final utterance never re-arrives after the echo-window rewind — seed
    // the capture with what was already heard. Partial-triggered interrupts
    // skip this: their words re-deliver as clean finals and would duplicate.
    if (utteranceStable) {
      const seed = wake?.detected ? wake.question : u.text.trim();
      if (seed) {
        this.inlineQuestion = seed;
        this.scheduleQuestionResolution(
          this.settleDelayForDraft(u.speechFinal)
        );
      }
    }
  }

  private handleUtteranceEnd() {
    this.currentTurnTelemetry?.mark("end_of_utterance");
    // This segment is finalized (forced or natural); the next voiced segment
    // may force its own endpoint.
    this.endpointForced = false;
    if (this.capturingQuestion) {
      this.turnController.transition("endpointing");
    }
    void this.flushPersistedSpeakerTurn();
    if (!this.capturingQuestion) return;

    const draft = this.getCapturedQuestion().question;
    if (draft.length > 0) {
      // Speechmatics has detected end-of-turn — the speaker has gone silent
      // for `end_of_utterance_silence_trigger`. How long to still wait is
      // semantic, not acoustic: a question that reads finished dispatches
      // almost immediately, an ambiguous one waits a beat, and a tail like
      // "...and the" means they're pausing to think — hold long enough for
      // the thought to land instead of answering mid-sentence. Context was
      // already prefetched while capturing, so we skip re-scheduling it here.
      const completeness = assessQuestionCompleteness(draft);
      const graceMs = END_OF_UTTERANCE_GRACE_MS[completeness];
      devLog("wake", `End of turn — question reads ${completeness}, grace ${graceMs}ms.`);
      this.currentTurnTelemetry?.mark("endpoint_grace", {
        completeness,
        graceMs,
      });
      this.scheduleQuestionResolution(graceMs, {
        prefetch: false,
      });
      return;
    }

    // If the user only said "Hey Kivo", keep the capture window open for the
    // next utterance instead of immediately falling back to passive listening.
    this.wakeUtteranceId = null;
    this.wakeSpeaker = null;
    useAriaStore.getState().setStatus("capturing-question");
  }

  private handleWake(
    utteranceId: string,
    speaker: number,
    speakerName: string | null,
    providerSpeakerLabel: string | null
  ) {
    const store = useAriaStore.getState();
    this.currentTurnTelemetry?.finish("aborted", { reason: "superseded_by_wake" });
    this.currentTurnTelemetry = new VoiceTurnTelemetry(this.sessionId);
    this.currentTurnTelemetry.mark("wake");
    if (this.localSpeechActive) {
      this.currentTurnTelemetry.mark("speech_onset", { backfilled: true });
    }
    if (
      store.status === "thinking" ||
      store.status === "searching" ||
      store.status === "speaking" ||
      store.status === "capturing-question"
    ) {
      // Barge-in: stop Kivo and start capturing a fresh question.
      this.reportPlaybackInterruption();
      this.stopPlayback();
      this.abortActiveFetch();
      this.cues.stopWorkCue();
      // Keep the mic live so the question following the wake word isn't clipped
      // by the post-playback cooldown.
      this.suppressSttUntilMs = 0;
    }
    // A fresh wake supersedes any half-finished capture — clear its live
    // fragments so they don't strand in the transcript.
    this.clearCaptureFromLive();
    this.stopFollowUpWindow();
    this.clearQuestionSettleTimer();
    this.questionUtterances = [];
    this.inlineQuestion = "";
    this.capturePartial = "";
    this.endpointForced = false;
    this.wakeUtteranceId = utteranceId;
    this.wakeSpeaker = speaker;
    this.wakeSpeakerName = speakerName;
    this.wakeProviderSpeakerLabel = providerSpeakerLabel;
    this.captureWholeAnchorUtterance = false;
    this.capturingQuestion = true;
    this.turnController.transition("capturing");
    this.cues.playWake();
    store.setStatus("capturing-question");
    devLog("wake", "Wake phrase detected — say your question (or continue).");
  }

  /**
   * Leave the searching state once the lookup is over. Playback starting is not
   * enough on its own: with the spoken hand-off, audio begins *during* the
   * search, so "speaking" is set before the results land — and a later search
   * would otherwise strand the orb on "searching the web" for the rest of the
   * answer. Driven by both the completion event and the first answer token, so
   * it recovers even if the provider never reports the search as finished.
   */
  private endSearchState() {
    const store = useAriaStore.getState();
    if (store.status !== "searching") return;
    this.cues.stopWorkCue();
    if (this.isAssistantSpeaking) {
      store.setStatus("speaking");
      return;
    }
    store.setStatus("thinking");
    this.cues.startThinkingLoop();
  }

  private async playPcmWorkletResponse(
    body: ReadableStream<Uint8Array>,
    sampleRate: number,
    encoding: "pcm_f32le" | "pcm_s16le",
    logMessage: string,
    options: { enableFollowUp?: boolean; clientT0?: number; mux?: boolean }
  ) {
    const playback = await this.cues.getPlaybackContext();
    if (!playback) {
      throw new Error("Audio context unavailable for PCM playback");
    }
    this.stopPlayback();
    const generation = this.playbackGeneration;
    const { ctx, master } = playback;
    const answerGain = ctx.createGain();
    answerGain.gain.value = 1;
    answerGain.connect(master);
    this.answerGain = answerGain;
    this.ducked = false;

    const state = {
      ctx,
      startedAt: null as number | null,
      playhead: 0,
      sources: new Set<AudioBufferSourceNode>(),
      endTimer: null as ReturnType<typeof setTimeout> | null,
      streamDone: false,
    };
    this.pcmPlayback = state;

    const finishPlayback = () => {
      if (generation !== this.playbackGeneration) return;
      this.teardownBargeIn();
      this.releaseEchoCancellation();
      this.pcmStreamPlayer = null;
      this.pcmPlayback = null;
      this.isAssistantSpeaking = false;
      this.stt?.markAssistantSpeechEnd();
      this.suppressSttUntilMs = Date.now() + PLAYBACK_STT_COOLDOWN_MS;
      useAriaStore.getState().setStatus("listening");
      this.turnController.transition("listening");
      this.currentTurnTelemetry?.finish("completed");
      this.currentTurnTelemetry = null;
      if (options.enableFollowUp) {
        this.followUpStartTimer = setTimeout(() => {
          this.followUpStartTimer = null;
          this.startFollowUpWindow();
        }, PLAYBACK_STT_COOLDOWN_MS);
      }
    };

    const player = await PcmStreamPlayer.create({
      context: ctx,
      destination: answerGain,
      sourceSampleRate: sampleRate,
      encoding,
      prebufferMs: VOICE_ENGINE_V2_TIMING.playbackPrebufferMs,
      onStarted: () => {
        if (generation !== this.playbackGeneration) return;
        state.startedAt = ctx.currentTime;
        this.clearFollowUpStartTimer();
        this.stopFollowUpWindow();
        this.isAssistantSpeaking = true;
        this.stt?.markAssistantSpeechStart();
        void this.mic?.setPlaybackEchoCancellation(true).then((aec) => {
          this.currentTurnTelemetry?.mark("aec_state", {
            aecRequested: aec.requested,
            aecActual: aec.actual,
            phase: "playback",
          });
        });
        this.bargeIn.start();
        this.cues.stopWorkCue();
        useAriaStore.getState().setStatus("speaking");
        this.turnController.transition("speaking");
        this.currentTurnTelemetry?.mark("first_audible_sample", {
          format: "pcm",
          sampleRate: ctx.sampleRate,
          sourceSampleRate: sampleRate,
          encoding,
        });
        devLog("tts", logMessage);
      },
      onUnderrun: () => {
        this.currentTurnTelemetry?.mark("playback_underrun");
      },
      onEnded: finishPlayback,
    });
    if (generation !== this.playbackGeneration) {
      player.stop();
      return;
    }
    this.pcmStreamPlayer = player;

    const reader = body.getReader();
    let receivedAudio = false;
    const pushAudio = (bytes: Uint8Array) => {
      if (bytes.byteLength === 0) return;
      if (!receivedAudio) {
        receivedAudio = true;
        this.currentTurnTelemetry?.mark("first_audio_chunk", {
          bytes: bytes.byteLength,
        });
        if (options.clientT0 != null) {
          devLog("pipeline", "first_audio_chunk", {
            ms: Math.round(performance.now() - options.clientT0),
            bytes: bytes.byteLength,
          });
        }
      }
      player.push(bytes);
    };
    // Mux path: audio and the answer's text tokens share the stream. Text
    // accumulates into liveAnswerText for echo discrimination (and captions).
    const demux = options.mux
      ? new MuxStreamDecoder({
          onAudio: pushAudio,
          onText: (text) => {
            // Answer text means the results are in, whether or not the
            // provider bothered to report the search as finished.
            this.endSearchState();
            this.liveAnswerText += text;
          },
          onEvent: (event) => {
            if (event.type === "tool_started") {
              // Anthropic gets two searches per turn, and the second one often
              // lands mid-answer. That is background work — Kivo keeps talking
              // through it, so re-flagging the room as "searching" would just
              // be a glitch the answer never waits for.
              if (this.isAssistantSpeaking) return;
              this.cues.playSearch();
              this.cues.startSearchingLoop();
              useAriaStore.getState().setStatus("searching");
              return;
            }
            this.endSearchState();
          },
        })
      : null;
    try {
      while (true) {
        if (generation !== this.playbackGeneration) {
          void reader.cancel().catch(() => {});
          return;
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        if (demux) {
          demux.push(value);
        } else {
          pushAudio(value);
        }
      }
      if (generation !== this.playbackGeneration) return;
      state.streamDone = true;
      if (!receivedAudio) {
        throw new Error("Answer stream contained no audio");
      }
      player.finish();
    } catch (err) {
      if (generation === this.playbackGeneration) this.stopPlayback();
      throw err;
    }
  }

  /**
   * The user cut a playing answer short — report how far playback got so the
   * persisted turn reflects what was heard, not what was synthesized. The
   * AudioContext clip path (iOS WebKit) exposes no position, so it stays
   * covered by the server's streamed-chunk estimate only.
   */
  private reportPlaybackInterruption() {
    if (!this.isAssistantSpeaking) return;

    if (this.pcmStreamPlayer) {
      const played = this.pcmStreamPlayer.playbackSeconds;
      if (played > 0) {
        void reportAnswerInterrupted(this.sessionId, played, null).catch(
          () => {}
        );
      }
      return;
    }

    const pcm = this.pcmPlayback;
    if (pcm && pcm.startedAt != null) {
      const played = Math.max(0, pcm.ctx.currentTime - pcm.startedAt);
      if (played <= 0) return;
      const total = pcm.streamDone
        ? Math.max(played, pcm.playhead - pcm.startedAt)
        : null;
      void reportAnswerInterrupted(this.sessionId, played, total).catch(
        () => {}
      );
      return;
    }

    const audio = this.currentAudio;
    if (!audio) return;
    const played = audio.currentTime;
    if (!played || played <= 0) return;
    const total =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : null;
    void reportAnswerInterrupted(this.sessionId, played, total).catch(() => {});
  }

  /** The barge-in detector suspects the user is talking over Kivo — drop the
   * answer volume immediately so they hear they've been heard, without killing
   * the answer yet (it may be a cough/laugh that never confirms). */
  private duckPlayback() {
    if (this.ducked) return;
    this.ducked = true;
    devLog("tts", "Barge-in suspected — ducking answer.");
    if (this.answerGain) {
      const g = this.answerGain.gain;
      const t = this.answerGain.context.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(DUCK_GAIN, t + DUCK_RAMP_S);
    }
    if (this.currentAudio) {
      this.currentAudio.volume = DUCK_GAIN;
    }
  }

  /** The suspected interruption fizzled out before confirming — restore the
   * answer volume and keep playing. */
  private unduckPlayback() {
    if (!this.ducked) return;
    this.ducked = false;
    devLog("tts", "Barge-in aborted — restoring answer volume.");
    if (this.answerGain) {
      const g = this.answerGain.gain;
      const t = this.answerGain.context.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(1, t + DUCK_RAMP_S);
    }
    if (this.currentAudio) {
      this.currentAudio.volume = 1;
    }
  }

  /** Confirmed barge-in: the user is genuinely interrupting. Stop the answer
   * and open a wake-free capture window so what they're saying becomes the
   * next question — the Claude-style "just start talking" interruption. */
  private handleAcousticBargeIn(info: { onsetSecondsAgo: number }) {
    const status = useAriaStore.getState().status;
    if (!this.isAssistantSpeaking && status !== "thinking" && status !== "searching")
      return;
    this.currentTurnTelemetry?.mark("barge_in_confirmed", {
      from: status,
      onsetSecondsAgo: info.onsetSecondsAgo,
    });
    this.turnController.interrupt();
    this.bargeIn.stop();
    this.ducked = false;
    devLog("wake", "Barge-in confirmed — stopping answer and capturing.");
    this.reportPlaybackInterruption();
    // Rewind the echo window to the start of the interruption so the user's
    // interrupting words transcribe clean instead of being dropped as echo.
    if (this.isAssistantSpeaking) {
      this.stt?.markAssistantSpeechEnd({
        onsetBackoffSeconds: info.onsetSecondsAgo + BARGE_IN_ONSET_MARGIN_S,
      });
    }
    this.stopPlayback();
    this.abortActiveFetch();
    this.currentTurnTelemetry?.mark("interrupt_complete");
    this.currentTurnTelemetry?.finish("aborted", { reason: "barge_in" });
    this.currentTurnTelemetry = null;
    this.cues.stopWorkCue();
    // Keep the mic live (skip the post-playback cooldown) so the continuing
    // interruption reaches STT, then capture it without needing a wake word.
    this.suppressSttUntilMs = 0;
    this.startFollowUpWindow();
  }

  /** Stop watching for barge-in and release the ducking gain node.
   *
   * Note: this deliberately does NOT drop echo cancellation. On a barge-in this
   * runs while the user is mid-sentence, and toggling the mic constraint then
   * glitches the track and clips their opening words. AEC is instead released
   * at safe idle moments (natural playback end, or when a capture settles) via
   * `releaseEchoCancellation`. */
  private teardownBargeIn() {
    this.bargeIn.stop();
    this.ducked = false;
    if (this.answerGain) {
      try {
        this.answerGain.disconnect();
      } catch {
        // ignore
      }
      this.answerGain = null;
    }
  }

  /** Return the mic to its raw base (echo cancellation off in speaker mode) at
   * a moment when the user isn't mid-sentence, so recognition/diarization runs
   * on untouched audio again. Safe to call redundantly. */
  private releaseEchoCancellation() {
    void this.mic?.setPlaybackEchoCancellation(false).then((state) => {
      this.currentTurnTelemetry?.mark("aec_state", {
        aecRequested: state.requested,
        aecActual: state.actual,
        phase: "release",
      });
    });
  }

  private handleClose() {
    // "Thank you, Kivo" — tear down any in-flight answer/capture and return to
    // passive listening. The inverse of handleWake.
    this.reportPlaybackInterruption();
    this.stopPlayback();
    this.abortActiveFetch();
    this.cues.stopWorkCue();
    this.stopFollowUpWindow();
    this.clearCaptureFromLive();
    this.resetQuestionCapture();
    this.cues.playClose();
    useAriaStore.getState().setStatus("listening");
    devLog("wake", "Close phrase detected — conversation ended.");
  }

  /** Local UI stop: synchronous playback/fetch invalidation with no STT,
   * persistence, or session-summary dependency. */
  stopSpeaking(source: "local" | "speech" = "local"): boolean {
    const status = useAriaStore.getState().status;
    if (status !== "thinking" && status !== "searching" && status !== "speaking")
      return false;
    this.currentTurnTelemetry?.mark("stop_requested", { source });
    this.reportPlaybackInterruption();
    this.stopPlayback();
    this.abortActiveFetch();
    this.cues.stopWorkCue();
    this.stopFollowUpWindow();
    this.turnController.invalidate("listening");
    useAriaStore.getState().setStatus("listening");
    this.currentTurnTelemetry?.mark("stop_complete");
    this.currentTurnTelemetry?.finish("aborted", { reason: "local_stop" });
    this.currentTurnTelemetry = null;
    return true;
  }

  private handleStopCommand() {
    this.stopSpeaking("speech");
    this.clearCaptureFromLive();
    this.resetQuestionCapture();
    this.cues.playClose();
    useAriaStore.getState().setStatus("listening");
    devLog("wake", "Stop command detected — Kivo silenced.");
  }

  private handleFollowUp(
    utteranceId: string,
    speaker: number,
    speakerName: string | null,
    providerSpeakerLabel: string | null
  ) {
    const store = useAriaStore.getState();
    this.currentTurnTelemetry?.finish("aborted", {
      reason: "superseded_by_follow_up",
    });
    this.currentTurnTelemetry = new VoiceTurnTelemetry(this.sessionId);
    this.currentTurnTelemetry.mark("wake", { followUp: true });
    if (this.localSpeechActive) {
      this.currentTurnTelemetry.mark("speech_onset", { backfilled: true });
    }
    this.clearCaptureFromLive();
    this.stopFollowUpWindow();
    this.clearQuestionSettleTimer();
    this.questionUtterances = [];
    this.inlineQuestion = "";
    this.capturePartial = "";
    this.endpointForced = false;
    this.wakeUtteranceId = utteranceId;
    this.wakeSpeaker = speaker;
    this.wakeSpeakerName = speakerName;
    this.wakeProviderSpeakerLabel = providerSpeakerLabel;
    this.captureWholeAnchorUtterance = true;
    this.capturingQuestion = true;
    this.capturingFollowUp = true;
    this.scheduleFollowUpCaptureTimeout();
    this.turnController.transition("capturing");
    this.cues.playWake();
    store.setStatus("capturing-question");
    devLog("wake", "Follow-up captured without wake word.");
  }

  private upsertQuestionUtterance(u: TranscriptUtterance) {
    const text = u.text.trim();
    if (!text) return;

    const next = { ...u, text };
    const idx = this.questionUtterances.findIndex((x) => x.id === u.id);
    if (idx === -1) {
      this.questionUtterances.push(next);
      return;
    }

    this.questionUtterances[idx] = next;
  }

  private getCapturedQuestion(): {
    question: string;
    speaker: number | null;
    speakerName: string | null;
    providerSpeakerLabel: string | null;
    sourceUtteranceIds: string[];
  } {
    const parts = [
      this.inlineQuestion.trim(),
      ...this.questionUtterances.map((u) => u.text.trim()),
    ].filter(Boolean);

    let merged = "";
    for (const part of parts) {
      merged = joinText(merged, part);
    }

    // The raw live utterances that fed this question are pushed into the store
    // during capture (see handleUtterance) but never persisted as speaker turns.
    // Carrying their ids onto the persisted user_question turn lets
    // buildLiveTranscriptLines dedup the raw copies out of the live tail.
    const sourceUtteranceIds = [
      ...new Set(
        [this.wakeUtteranceId, ...this.questionUtterances.map((u) => u.id)].filter(
          (id): id is string => id != null
        )
      ),
    ];

    return {
      question: sanitizeQuestionText(merged),
      speaker: this.wakeSpeaker ?? this.questionUtterances[0]?.speaker ?? null,
      speakerName:
        this.wakeSpeakerName ?? this.questionUtterances[0]?.speakerName ?? null,
      providerSpeakerLabel:
        this.wakeProviderSpeakerLabel ??
        this.questionUtterances[0]?.providerSpeakerLabel ??
        null,
      sourceUtteranceIds,
    };
  }

  /** Fallback settle from the last transcript event, for when the provider's
   * end-of-turn is late or missing. Finals are completeness-graded — a
   * finished-reading question settles fast, an open tail holds; partials keep
   * the flat window since their text is still mutating. */
  private settleDelayForDraft(speechFinal: boolean | undefined): number {
    if (!speechFinal) return QUESTION_SETTLE_MS;
    return SETTLE_MS[
      assessQuestionCompleteness(this.getCapturedQuestion().question)
    ];
  }

  private scheduleQuestionResolution(
    delayMs: number,
    options: { prefetch?: boolean; extended?: boolean } = {}
  ) {
    this.clearQuestionSettleTimer();
    if (options.prefetch ?? true) {
      this.scheduleContextPrefetch();
    }
    this.questionSettleTimer = setTimeout(() => {
      this.questionSettleTimer = null;
      const { question } = this.getCapturedQuestion();
      if (!question) return;
      // Second look before dispatch: the delay was graded on the draft as it
      // stood when scheduled, but STT finals lag the end-of-turn signal — the
      // words proving the speaker wasn't done ("what's the…") often land
      // during the grace. If the fuller draft now warrants a longer hold,
      // extend once; any new transcript event restarts grading fresh.
      const requiredMs =
        END_OF_UTTERANCE_GRACE_MS[assessQuestionCompleteness(question)];
      if (requiredMs > delayMs && !options.extended) {
        devLog(
          "wake",
          `Draft grew and reads unfinished — extending grace ${requiredMs}ms.`
        );
        this.currentTurnTelemetry?.mark("settle_hold", {
          extendedMs: requiredMs,
        });
        this.scheduleQuestionResolution(requiredMs, {
          prefetch: false,
          extended: true,
        });
        return;
      }
      void this.resolveCapturedQuestion(question);
    }, delayMs);
  }

  private scheduleContextPrefetch() {
    this.clearContextPrefetchTimer();
    const generation = ++this.contextPrefetchGeneration;
    this.contextPrefetchTimer = setTimeout(() => {
      this.contextPrefetchTimer = null;
      if (generation !== this.contextPrefetchGeneration) return;
      const { question } = this.getCapturedQuestion();
      const draft = sanitizeQuestionText(question);
      if (!draft) return;
      void Promise.resolve(prefetchSessionContext(this.sessionId, draft)).catch(() => {
        // Best-effort; ask path builds context on miss.
      });
    }, CONTEXT_PREFETCH_DEBOUNCE_MS);
  }

  private clearContextPrefetchTimer() {
    if (!this.contextPrefetchTimer) return;
    clearTimeout(this.contextPrefetchTimer);
    this.contextPrefetchTimer = null;
  }

  private clearQuestionSettleTimer() {
    if (!this.questionSettleTimer) return;
    clearTimeout(this.questionSettleTimer);
    this.questionSettleTimer = null;
    this.contextPrefetchGeneration += 1;
    this.clearContextPrefetchTimer();
  }

  private scheduleTurnFlush() {
    this.clearTurnFlushTimer();
    this.turnFlushTimer = setTimeout(() => {
      this.turnFlushTimer = null;
      void this.flushPersistedSpeakerTurn();
    }, TURN_IDLE_FLUSH_MS);
  }

  private clearTurnFlushTimer() {
    if (!this.turnFlushTimer) return;
    clearTimeout(this.turnFlushTimer);
    this.turnFlushTimer = null;
  }

  private async resolveCapturedQuestion(question: string) {
    // Wake word + stop phrase in one utterance ("Kivo. Just shut up.") should
    // silence Kivo, not be sent to the LLM as a question.
    if (this.isStopCommand(question)) {
      this.handleStopCommand();
      return;
    }
    if (!isSubstantiveQuestion(question)) {
      this.clearCaptureFromLive();
      this.resetQuestionCapture();
      useAriaStore.getState().setStatus("listening");
      return;
    }
    const captured = this.getCapturedQuestion();
    await this.askAndReset(
      captured.question,
      captured.speaker,
      captured.speakerName,
      captured.sourceUtteranceIds
    );
  }

  private async askAndReset(
    question: string,
    speaker: number | null,
    speakerName: string | null,
    sourceUtteranceIds: string[]
  ) {
    const cleanQuestion = sanitizeQuestionText(question);
    // Claim any in-flight speculation for this question *before* the capture
    // reset below tears it down — askAria plays it instead of issuing a fresh
    // request. A mismatch (or none) returns null and is discarded here.
    const adopted = cleanQuestion
      ? this.takeMatchingSpeculation(cleanQuestion)
      : null;
    // Snapshot persistence is independent of dispatch. Firestore latency must
    // never sit between an endpoint and the answer request.
    void this.flushPersistedSpeakerTurn();
    this.resetQuestionCapture();
    if (!cleanQuestion) return;
    await this.askAria(
      cleanQuestion,
      speaker,
      speakerName,
      sourceUtteranceIds,
      adopted
    );
  }

  /**
   * Drop the current capture's utterances from the live transcript. Used only
   * on abandon/supersede paths (a bare wake with no question, a stop/close, a
   * non-substantive capture, or a fresh wake replacing an unfinished one) —
   * NOT on a successful ask, where the persisted user_question turn dedups
   * them by id and removing them early would blink the question out while
   * Kivo thinks.
   */
  private clearCaptureFromLive() {
    const ids = [
      this.wakeUtteranceId,
      ...this.questionUtterances.map((u) => u.id),
    ].filter((id): id is string => id != null);
    if (ids.length > 0) {
      useAriaStore.getState().removeUtterances(ids);
    }
  }

  private resetQuestionCapture() {
    this.clearQuestionSettleTimer();
    this.clearFollowUpCaptureTimer();
    // A capture that ends without being adopted (abandoned, non-substantive,
    // stop command, or superseded) must not leave a speculation streaming.
    this.abortSpeculativeAsk("capture_reset");
    // A capture settling (resolved, abandoned, or torn down) is a safe idle
    // moment to drop echo cancellation back to raw — the user has finished the
    // utterance, so we won't glitch it mid-word.
    this.releaseEchoCancellation();
    this.capturingQuestion = false;
    this.capturingFollowUp = false;
    this.questionUtterances = [];
    this.capturePartial = "";
    this.endpointForced = false;
    this.wakeUtteranceId = null;
    this.wakeSpeaker = null;
    this.wakeSpeakerName = null;
    this.wakeProviderSpeakerLabel = null;
    this.inlineQuestion = "";
    this.captureWholeAnchorUtterance = false;
  }

  private async askAria(
    question: string,
    speaker: number | null,
    speakerName: string | null,
    sourceUtteranceIds: string[] = [],
    adopted: {
      controller: AbortController;
      responsePromise: Promise<Response>;
      clientT0: number;
    } | null = null
  ) {
    if (question.length > ASK_QUESTION_MAX_CHARS) {
      devLog("ask", `Question over ${ASK_QUESTION_MAX_CHARS} chars — keeping the tail.`);
      question = question.slice(-ASK_QUESTION_MAX_CHARS);
    }
    if (sourceUtteranceIds.length > ASK_SOURCE_IDS_MAX) {
      sourceUtteranceIds = sourceUtteranceIds.slice(-ASK_SOURCE_IDS_MAX);
    }
    const store = useAriaStore.getState();
    store.setStatus("thinking");
    this.turnController.beginGeneration();
    if (this.voiceEngineV2) {
      this.bargeIn.start();
    }
    this.cues.startThinkingLoop();

    // `adopted` (from askAndReset) is a speculation whose request has been
    // running through the endpoint grace — its first audio is already inbound,
    // so we play it instead of issuing a fresh request. Null ⇒ normal dispatch,
    // identical to the pre-speculation behavior.
    this.abortActiveFetch();
    const controller = adopted?.controller ?? new AbortController();
    this.activeFetchAbort = controller;

    try {
      const clientT0 = adopted?.clientT0 ?? performance.now();
      devLog("pipeline", "fetch_start", { ms: 0, adopted: Boolean(adopted) });
      const telemetry =
        this.currentTurnTelemetry ??
        (this.currentTurnTelemetry = new VoiceTurnTelemetry(this.sessionId));
      telemetry.mark("dispatch", {
        voiceEngine: this.voiceEngineV2 ? "v2" : "v1",
        adopted: Boolean(adopted),
      });

      // A new answer supersedes the previous one's text — echo checks must
      // compare against what is actually playing.
      this.liveAnswerText = "";

      let res: Response;
      if (adopted) {
        // Headers already resolved while the request ran through the grace; the
        // body is filling with LLM/TTS output — playback starts near-instantly.
        res = await adopted.responsePromise;
      } else {
        const pcmContext =
          this.supportsPcmPlayback() && this.voiceEngineV2
            ? await this.cues.getPlaybackContext()
            : null;
        res = await askSessionQuestion(
          this.sessionId,
          question,
          speaker,
          speakerName,
          controller.signal,
          sourceUtteranceIds,
          {
            acceptPcm: this.supportsPcmPlayback(),
            acceptMuxText: this.supportsPcmPlayback(),
            pcmSampleRate: pcmContext?.ctx.sampleRate,
            turnId: telemetry.turnId,
          }
        );
      }

      devLog("pipeline", "response_headers", {
        ms: Math.round(performance.now() - clientT0),
        status: res.status,
        ok: res.ok,
      });
      telemetry.mark("response_headers", {
        status: res.status,
        format: res.headers.get("x-kivo-audio-format"),
        encoding: res.headers.get("x-kivo-encoding"),
        model: res.headers.get("x-kivo-model"),
        ttsTransport: res.headers.get("x-kivo-tts-transport"),
        fallback: res.headers.get("x-kivo-tts-fallback"),
      });
      const effectiveModel = res.headers.get("x-kivo-model");
      const requestedModel = res.headers.get("x-kivo-requested-model");
      store.setEffectiveModel(
        effectiveModel,
        effectiveModel &&
          requestedModel &&
          effectiveModel !== requestedModel
          ? `Requested ${requestedModel}; used ${effectiveModel}`
          : null
      );

      if (!res.ok || !res.body) {
        // The server returns { error } with a user-appropriate message
        // (quota, archived session, …) — prefer it over a raw status line.
        const errText = await res.text().catch(() => "");
        let serverMessage: string | null = null;
        try {
          serverMessage =
            (JSON.parse(errText) as { error?: string }).error ?? null;
        } catch {
          // Non-JSON body — fall through to the generic message.
        }
        devLog("error", `Ask failed: ${res.status} ${errText}`);
        throw new Error(
          serverMessage ?? "Kivo couldn't answer that — try again in a moment."
        );
      }

      await this.playAudioResponse(res, "Playing spoken answer in browser.", {
        enableFollowUp: true,
        clientT0,
      });
      track("ask_success");
      this.onSessionActivity?.();
    } catch (err) {
      this.cues.stopWorkCue();
      if (err instanceof DOMException && err.name === "AbortError") {
        devLog("ask", "Ask request aborted.");
        this.currentTurnTelemetry?.finish("aborted", { reason: "fetch_abort" });
        this.currentTurnTelemetry = null;
        return;
      }
      const msg = err instanceof Error ? err.message : "unknown";
      devLog("error", msg);
      this.cues.playError();
      // Raw transport failures read like stack noise to users; keep server-
      // provided messages (already user-appropriate) and translate the rest.
      const friendly = /fetch|network|load failed|unknown/i.test(msg)
        ? "Kivo couldn't answer that — check your connection and try again."
        : msg;
      useAriaStore.getState().setError(friendly);
      this.currentTurnTelemetry?.finish("failed", { message: friendly });
      this.currentTurnTelemetry = null;
    } finally {
      if (this.activeFetchAbort === controller) {
        this.activeFetchAbort = null;
      }
    }
  }

  /** Web Audio raw-PCM playback is preferred (single WS synthesis context on
   * the server = prosody carries across sentences). iOS WebKit stays on the
   * buffered MP3 clip path, which is the only reliable one there. */
  private supportsPcmPlayback(): boolean {
    if (typeof window === "undefined") return false;
    if (isIOSWebKit()) return false;
    return Boolean(
      window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
    );
  }

  private async playAudioResponse(
    res: Response,
    logMessage: string,
    options: { enableFollowUp?: boolean; clientT0?: number } = {}
  ) {
    if (!res.body) {
      throw new Error("Audio response has no body");
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("x-kivo-pcm")) {
      const sampleRate =
        Number(res.headers.get("x-kivo-sample-rate")) || 24000;
      const encoding =
        res.headers.get("x-kivo-encoding") === "pcm_f32le"
          ? "pcm_f32le"
          : "pcm_s16le";
      await this.playPcmStreamingResponse(
        res.body,
        sampleRate,
        encoding,
        logMessage,
        { ...options, mux: contentType.includes("x-kivo-pcm-mux") }
      );
      return;
    }

    // iOS WebKit blocks HTMLAudioElement.play() outside a user gesture, so route
    // the answer through the AudioContext that was unlocked at session start.
    if (isIOSWebKit()) {
      await this.playViaAudioContext(res, logMessage, options);
      return;
    }

    const mseSupported =
      typeof MediaSource !== "undefined" &&
      MediaSource.isTypeSupported?.("audio/mpeg");

    if (mseSupported) {
      await this.playStreamingResponse(res.body, logMessage, options);
      return;
    }

    // Fallback: buffer the whole MP3 then play it.
    const buf = await res.arrayBuffer();
    if (options.clientT0 != null) {
      devLog("pipeline", "buffered_audio", {
        ms: Math.round(performance.now() - options.clientT0),
        bytes: buf.byteLength,
      });
    }
    const blob = new Blob([buf], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    this.attachPlayback(url, () => URL.revokeObjectURL(url), logMessage, options);
  }

  private async playStreamingResponse(
    body: ReadableStream<Uint8Array>,
    logMessage: string,
    options: { enableFollowUp?: boolean; clientT0?: number }
  ) {
    const mediaSource = new MediaSource();
    const url = URL.createObjectURL(mediaSource);

    const sourceOpen = new Promise<SourceBuffer>((resolve, reject) => {
      const onOpen = () => {
        mediaSource.removeEventListener("sourceopen", onOpen);
        try {
          const sb = mediaSource.addSourceBuffer("audio/mpeg");
          resolve(sb);
        } catch (err) {
          reject(err);
        }
      };
      mediaSource.addEventListener("sourceopen", onOpen);
    });

    // Start the <audio> element pointing at the MediaSource now so it begins
    // decoding/playing as soon as we append the first bytes.
    this.attachPlayback(
      url,
      () => URL.revokeObjectURL(url),
      logMessage,
      options
    );
    const generation = this.playbackGeneration;

    const sourceBuffer = await sourceOpen;
    if (generation !== this.playbackGeneration) return;
    const reader = body.getReader();
    let loggedFirstChunk = false;

    const append = (chunk: Uint8Array) =>
      new Promise<void>((resolve, reject) => {
        const onUpdate = () => {
          sourceBuffer.removeEventListener("updateend", onUpdate);
          sourceBuffer.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          sourceBuffer.removeEventListener("updateend", onUpdate);
          sourceBuffer.removeEventListener("error", onError);
          reject(new Error("SourceBuffer append error"));
        };
        sourceBuffer.addEventListener("updateend", onUpdate);
        sourceBuffer.addEventListener("error", onError);
        sourceBuffer.appendBuffer(chunk as BufferSource);
      });

    try {
      while (true) {
        if (generation !== this.playbackGeneration) {
          void reader.cancel().catch(() => {});
          return;
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        if (!loggedFirstChunk) {
          loggedFirstChunk = true;
          this.currentTurnTelemetry?.mark("first_audio_chunk", {
            bytes: value.byteLength,
            fallback: true,
          });
          if (options.clientT0 != null) {
            devLog("pipeline", "first_audio_chunk", {
              ms: Math.round(performance.now() - options.clientT0),
              bytes: value.byteLength,
            });
          }
        }
        await append(value);
      }
      if (mediaSource.readyState === "open") {
        mediaSource.endOfStream();
      }
    } catch (err) {
      try {
        if (mediaSource.readyState === "open") {
          mediaSource.endOfStream("decode");
        }
      } catch {
        // ignore
      }
      throw err;
    }
  }

  /**
   * Raw-PCM answer playback: schedule s16le chunks back-to-back on the cue
   * engine's already-unlocked AudioContext as they stream in. Replaces
   * MediaSource for PCM-capable browsers — the server synthesizes the whole
   * answer in one Cartesia WS context, so the audio is one continuous take.
   */
  private async playPcmStreamingResponse(
    body: ReadableStream<Uint8Array>,
    sampleRate: number,
    encoding: "pcm_f32le" | "pcm_s16le",
    logMessage: string,
    options: { enableFollowUp?: boolean; clientT0?: number; mux?: boolean }
  ) {
    if (this.voiceEngineV2) {
      await this.playPcmWorkletResponse(
        body,
        sampleRate,
        encoding,
        logMessage,
        options
      );
      return;
    }

    const playback = await this.cues.getPlaybackContext();
    if (!playback) {
      throw new Error("Audio context unavailable for PCM playback");
    }
    this.stopPlayback();
    const generation = this.playbackGeneration;
    const { ctx, master } = playback;

    // Route the answer through its own gain node so barge-in ducking can drop
    // its volume without affecting cues or the shared master.
    const answerGain = ctx.createGain();
    answerGain.gain.value = 1;
    answerGain.connect(master);
    this.answerGain = answerGain;
    this.ducked = false;

    const state = {
      ctx,
      startedAt: null as number | null,
      playhead: 0,
      sources: new Set<AudioBufferSourceNode>(),
      endTimer: null as ReturnType<typeof setTimeout> | null,
      streamDone: false,
    };
    this.pcmPlayback = state;

    const onFirstAudio = () => {
      this.clearFollowUpStartTimer();
      this.stopFollowUpWindow();
      this.isAssistantSpeaking = true;
      this.stt?.markAssistantSpeechStart();
      void this.mic?.setPlaybackEchoCancellation(true).then((aec) => {
        this.currentTurnTelemetry?.mark("aec_state", {
          aecRequested: aec.requested,
          aecActual: aec.actual,
          phase: "playback",
        });
      });
      this.bargeIn.start();
      this.cues.stopWorkCue();
      useAriaStore.getState().setStatus("speaking");
      this.turnController.transition("speaking");
      this.currentTurnTelemetry?.mark("first_audible_sample", {
        format: "pcm",
        sampleRate,
        encoding,
      });
      if (options.clientT0 != null) {
        devLog("pipeline", "speaking", {
          ms: Math.round(performance.now() - options.clientT0),
        });
      }
      devLog("tts", logMessage);
    };

    const onPlaybackEnded = () => {
      if (generation !== this.playbackGeneration) return;
      this.teardownBargeIn();
      // Natural end (user wasn't interrupting) — safe to drop AEC back to raw.
      this.releaseEchoCancellation();
      this.pcmPlayback = null;
      this.isAssistantSpeaking = false;
      this.stt?.markAssistantSpeechEnd();
      this.suppressSttUntilMs = Date.now() + PLAYBACK_STT_COOLDOWN_MS;
      useAriaStore.getState().setStatus("listening");
      this.turnController.transition("listening");
      this.currentTurnTelemetry?.finish("completed");
      this.currentTurnTelemetry = null;
      if (options.enableFollowUp) {
        this.followUpStartTimer = setTimeout(() => {
          this.followUpStartTimer = null;
          this.startFollowUpWindow();
        }, PLAYBACK_STT_COOLDOWN_MS);
      }
    };

    const scheduleSamples = (samples: Float32Array<ArrayBuffer>) => {
      const buffer = ctx.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(samples, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(answerGain);
      if (state.startedAt == null) {
        // Small lead-in so the first buffers queue gap-free.
        state.startedAt = ctx.currentTime + 0.12;
        state.playhead = state.startedAt;
        onFirstAudio();
      }
      const startAt = Math.max(state.playhead, ctx.currentTime);
      source.start(startAt);
      state.playhead = startAt + buffer.duration;
      state.sources.add(source);
      source.onended = () => {
        state.sources.delete(source);
      };
    };

    const reader = body.getReader();
    let leftover: Uint8Array | null = null;
    let loggedFirstChunk = false;

    try {
      while (true) {
        if (generation !== this.playbackGeneration) {
          void reader.cancel().catch(() => {});
          return;
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        if (!loggedFirstChunk && options.clientT0 != null) {
          loggedFirstChunk = true;
          devLog("pipeline", "first_audio_chunk", {
            ms: Math.round(performance.now() - options.clientT0),
            bytes: value.byteLength,
          });
        }

        // PCM frames can split across network chunks — carry an incomplete
        // trailing sample into the next chunk.
        let bytes = value;
        if (leftover && leftover.length > 0) {
          const merged = new Uint8Array(leftover.length + value.length);
          merged.set(leftover, 0);
          merged.set(value, leftover.length);
          bytes = merged;
          leftover = null;
        }
        const bytesPerSample = encoding === "pcm_f32le" ? 4 : 2;
        const usable = bytes.length - (bytes.length % bytesPerSample);
        if (usable < bytes.length) {
          leftover = bytes.slice(usable);
        }
        if (usable === 0) continue;

        const aligned = bytes.slice(0, usable);
        const view = new DataView(
          aligned.buffer,
          aligned.byteOffset,
          aligned.byteLength
        );
        const samples = new Float32Array(usable / bytesPerSample);
        for (let i = 0; i < samples.length; i++) {
          samples[i] =
            encoding === "pcm_f32le"
              ? view.getFloat32(i * 4, true)
              : view.getInt16(i * 2, true) / 32768;
        }
        scheduleSamples(samples);
      }

      if (generation !== this.playbackGeneration) return;
      state.streamDone = true;
      if (state.startedAt == null) {
        throw new Error("Answer stream contained no audio");
      }
      const remainingMs =
        Math.max(0, state.playhead - ctx.currentTime) * 1000 + 60;
      state.endTimer = setTimeout(onPlaybackEnded, remainingMs);
    } catch (err) {
      if (generation === this.playbackGeneration) {
        this.stopPlayback();
      }
      throw err;
    }
  }

  // iOS playback path: decode the whole MP3 and play it through the CueEngine's
  // AudioContext, which was unlocked by the user's tap in start(). Unlike a fresh
  // HTMLAudioElement, a buffer source on an already-running context plays without
  // needing its own user gesture.
  private async playViaAudioContext(
    res: Response,
    logMessage: string,
    options: { enableFollowUp?: boolean; clientT0?: number }
  ) {
    const buf = await res.arrayBuffer();
    if (options.clientT0 != null) {
      devLog("pipeline", "buffered_audio", {
        ms: Math.round(performance.now() - options.clientT0),
        bytes: buf.byteLength,
      });
    }

    this.stopPlayback();
    const generation = this.playbackGeneration;

    const handle = await this.cues.playClip(buf, {
      onPlay: () => {
        if (generation !== this.playbackGeneration) return;
        this.clearFollowUpStartTimer();
        this.stopFollowUpWindow();
        this.isAssistantSpeaking = true;
        this.stt?.markAssistantSpeechStart();
        this.cues.stopWorkCue();
        useAriaStore.getState().setStatus("speaking");
        if (options.clientT0 != null) {
          devLog("pipeline", "speaking", {
            ms: Math.round(performance.now() - options.clientT0),
          });
        }
        devLog("tts", logMessage);
      },
      onEnded: () => {
        if (generation !== this.playbackGeneration) return;
        this.currentClipStop = null;
        this.isAssistantSpeaking = false;
        this.stt?.markAssistantSpeechEnd();
        this.suppressSttUntilMs = Date.now() + PLAYBACK_STT_COOLDOWN_MS;
        useAriaStore.getState().setStatus("listening");
        this.turnController.transition("listening");
        this.currentTurnTelemetry?.finish("completed");
        this.currentTurnTelemetry = null;
        if (options.enableFollowUp) {
          this.followUpStartTimer = setTimeout(() => {
            this.followUpStartTimer = null;
            this.startFollowUpWindow();
          }, PLAYBACK_STT_COOLDOWN_MS);
        }
      },
      onError: (err) => {
        if (generation !== this.playbackGeneration) return;
        this.currentClipStop = null;
        this.isAssistantSpeaking = false;
        this.stt?.markAssistantSpeechEnd();
        this.suppressSttUntilMs = Date.now() + PLAYBACK_STT_COOLDOWN_MS;
        this.cues.stopWorkCue();
        this.cues.playError();
        const msg = err instanceof Error ? err.message : "Audio playback error";
        useAriaStore.getState().setError(msg);
        this.currentTurnTelemetry?.finish("failed", { message: msg });
        this.currentTurnTelemetry = null;
      },
    });

    if (!handle) return;
    if (generation !== this.playbackGeneration) {
      // A newer turn started while we were decoding — discard this one.
      handle.stop();
      return;
    }
    this.currentClipStop = handle.stop;
  }

  private attachPlayback(
    url: string,
    revoke: () => void,
    logMessage: string,
    options: { enableFollowUp?: boolean; clientT0?: number }
  ) {
    this.stopPlayback();
    const audio = new Audio(url);
    this.currentAudio = audio;
    this.currentAudioUrl = url;
    audio.onplay = () => {
      this.clearFollowUpStartTimer();
      this.stopFollowUpWindow();
      this.isAssistantSpeaking = true;
      this.stt?.markAssistantSpeechStart();
      void this.mic?.setPlaybackEchoCancellation(true).then((aec) => {
        this.currentTurnTelemetry?.mark("aec_state", {
          aecRequested: aec.requested,
          aecActual: aec.actual,
          phase: "playback",
        });
      });
      this.bargeIn.start();
      this.cues.stopWorkCue();
      useAriaStore.getState().setStatus("speaking");
      this.turnController.transition("speaking");
      this.currentTurnTelemetry?.mark("first_audible_sample", {
        format: "mp3",
      });
      if (options.clientT0 != null) {
        devLog("pipeline", "speaking", {
          ms: Math.round(performance.now() - options.clientT0),
        });
      }
    };
    audio.onended = () => {
      if (this.currentAudio !== audio) return;
      this.teardownBargeIn();
      this.releaseEchoCancellation();
      revoke();
      this.currentAudio = null;
      this.currentAudioUrl = null;
      this.isAssistantSpeaking = false;
      this.stt?.markAssistantSpeechEnd();
      this.suppressSttUntilMs = Date.now() + PLAYBACK_STT_COOLDOWN_MS;
      useAriaStore.getState().setStatus("listening");
      this.turnController.transition("listening");
      this.currentTurnTelemetry?.finish("completed");
      this.currentTurnTelemetry = null;
      if (options.enableFollowUp) {
        this.followUpStartTimer = setTimeout(() => {
          this.followUpStartTimer = null;
          this.startFollowUpWindow();
        }, PLAYBACK_STT_COOLDOWN_MS);
      }
    };
    audio.onerror = () => {
      if (this.currentAudio !== audio) return;
      this.teardownBargeIn();
      this.releaseEchoCancellation();
      revoke();
      this.currentAudio = null;
      this.currentAudioUrl = null;
      this.isAssistantSpeaking = false;
      this.stt?.markAssistantSpeechEnd();
      this.suppressSttUntilMs = Date.now() + PLAYBACK_STT_COOLDOWN_MS;
      this.cues.stopWorkCue();
      this.cues.playError();
      useAriaStore.getState().setError("Audio playback error");
      this.currentTurnTelemetry?.finish("failed", {
        message: "Audio playback error",
      });
      this.currentTurnTelemetry = null;
    };
    void audio.play().catch((err) => {
      if (this.currentAudio !== audio) return;
      const msg = err instanceof Error ? err.message : "play failed";
      useAriaStore.getState().setError(msg);
    });
    devLog("tts", logMessage);
  }

  private startFollowUpWindow() {
    this.stopFollowUpWindow();
    this.followUpListening = true;
    useAriaStore.getState().setStatus("follow-up-listening");
    // Conversation mode: after an answer the session stays open — anything
    // said in this window is the next turn, no wake word, like a hands-free
    // Claude voice conversation. Renewed after every answer; ended by a
    // stop/close command or by this much silence.
    this.followUpTimer = setTimeout(() => {
      this.followUpListening = false;
      this.followUpTimer = null;
      // Only revert if nothing else has taken over (wake/think/speak all
      // explicitly set their own status, so we just no-op in those cases).
      if (useAriaStore.getState().status === "follow-up-listening") {
        useAriaStore.getState().setStatus("listening");
      }
      devLog("wake", "Conversation window closed.");
    }, CONVERSATION_WINDOW_MS);
    this.cues.playFollowUp();
    devLog("wake", "Conversation window open.");
  }

  private clearFollowUpStartTimer() {
    if (!this.followUpStartTimer) return;
    clearTimeout(this.followUpStartTimer);
    this.followUpStartTimer = null;
  }

  private stopFollowUpWindow() {
    this.clearFollowUpStartTimer();
    this.followUpListening = false;
    if (!this.followUpTimer) return;
    clearTimeout(this.followUpTimer);
    this.followUpTimer = null;
  }

  private scheduleFollowUpCaptureTimeout() {
    this.clearFollowUpCaptureTimer();
    this.followUpCaptureTimer = setTimeout(() => {
      this.followUpCaptureTimer = null;
      if (!this.capturingQuestion || !this.capturingFollowUp) return;

      this.currentTurnTelemetry?.finish("aborted", {
        reason: "follow_up_capture_timeout",
      });
      this.currentTurnTelemetry = null;
      this.clearCaptureFromLive();
      this.resetQuestionCapture();
      this.turnController.transition("listening");
      useAriaStore.getState().setStatus("listening");
      devLog("wake", "Follow-up capture timed out — returning to listening.");
    }, FOLLOW_UP_CAPTURE_TIMEOUT_MS);
  }

  private clearFollowUpCaptureTimer() {
    if (!this.followUpCaptureTimer) return;
    clearTimeout(this.followUpCaptureTimer);
    this.followUpCaptureTimer = null;
  }

  private abortActiveFetch() {
    // A pending speculation is a fetch-in-flight too; a supersede/stop/barge-in
    // that aborts the active answer must also drop it. (No-op once adopted —
    // takeMatchingSpeculation has already cleared it.)
    this.abortSpeculativeAsk("fetch_superseded");
    if (!this.activeFetchAbort) return;
    this.activeFetchAbort.abort();
    this.activeFetchAbort = null;
  }

  private stopPlayback() {
    this.teardownBargeIn();
    this.isAssistantSpeaking = false;
    // Close any dangling open assistant-speech interval (barge-in / stop
    // command cutting playback short) so the echo tail is still bounded.
    this.stt?.markAssistantSpeechEnd();
    this.suppressSttUntilMs = Date.now() + PLAYBACK_STT_COOLDOWN_MS;
    this.clearFollowUpStartTimer();
    // Invalidate any in-flight clip callbacks and stop the active buffer source.
    this.playbackGeneration++;
    if (this.pcmStreamPlayer) {
      this.pcmStreamPlayer.stop();
      this.pcmStreamPlayer = null;
    }
    if (this.pcmPlayback) {
      const pcm = this.pcmPlayback;
      if (pcm.endTimer) clearTimeout(pcm.endTimer);
      for (const source of pcm.sources) {
        source.onended = null;
        try {
          source.stop();
        } catch {
          // already stopped
        }
        try {
          source.disconnect();
        } catch {
          // ignore
        }
      }
      pcm.sources.clear();
      this.pcmPlayback = null;
    }
    if (this.currentClipStop) {
      try {
        this.currentClipStop();
      } catch {
        // ignore
      }
      this.currentClipStop = null;
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.src = "";
      } catch {
        // ignore
      }
      this.currentAudio = null;
    }
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }
  }

  private async bufferSpeakerTurn(u: TranscriptUtterance) {
    const flushed = this.turnAssembler.append(u);
    if (flushed) {
      await this.persistAssembledSpeakerTurn(flushed);
    }
    this.scheduleTurnFlush();
  }

  private async flushPersistedSpeakerTurn() {
    this.clearTurnFlushTimer();
    const flushed = this.turnAssembler.flush();
    if (flushed) {
      await this.persistAssembledSpeakerTurn(flushed);
    }
  }

  private async persistAssembledSpeakerTurn(turn: AssembledTranscriptTurn) {
    const u = turn.utterance;
    const alreadyPersisted = turn.sourceUtteranceIds.every((id) =>
      this.persistedUtteranceIds.has(id)
    );
    if (alreadyPersisted) return;

    const text = u.text.trim();
    if (!text) return;

    for (const id of turn.sourceUtteranceIds) {
      this.persistedUtteranceIds.add(id);
    }

    try {
      const persisted = await appendSessionTurn(this.sessionId, {
        role: "speaker",
        text,
        speaker: this.transcriptionMode === "basic" ? null : u.speaker,
        speakerName: u.speakerName ?? null,
        providerSpeakerLabel: u.providerSpeakerLabel ?? null,
        sourceUtteranceIds: turn.sourceUtteranceIds,
      });
      if (u.providerSpeakerLabel) {
        const ids = this.streamTurnIdsByLabel.get(u.providerSpeakerLabel) ?? [];
        ids.push(persisted.id);
        this.streamTurnIdsByLabel.set(u.providerSpeakerLabel, ids);
      }
      this.onSessionActivity?.();
    } catch (err) {
      for (const id of turn.sourceUtteranceIds) {
        this.persistedUtteranceIds.delete(id);
      }
      const msg = err instanceof Error ? err.message : "unknown error";
      devLog("session", `Failed to persist speaker turn: ${msg}`);
    }
  }

  /** Names available as correction targets in the transcript UI. */
  getEnrolledSpeakerNames(): string[] {
    return this.enrolledProfiles.map((profile) => profile.name);
  }

  /**
   * "That wasn't Jack" — fixes a speaker misattribution for the current
   * recognition stream. Relabels this stream's persisted turns and the live
   * transcript tail, then restarts recognition: the provider's in-stream
   * clusters adapt toward whoever they absorb, so a wrong first attribution
   * self-reinforces and can only be shed by re-seeding fresh clusters from
   * the enrolled voiceprints. Mic audio queues through the ~1–2s restart.
   */
  async correctSpeakerAttribution(input: {
    providerSpeakerLabel: string;
    /** Corrected display name; null means "not an enrolled voice". */
    correctedName: string | null;
  }): Promise<void> {
    const { providerSpeakerLabel, correctedName } = input;
    devLog("speaker", "Speaker correction requested.", {
      providerSpeakerLabel,
      correctedName,
    });

    // Persist anything still buffered under the old label so the relabel
    // below catches it too.
    await this.flushPersistedSpeakerTurn();

    const turnIds = this.streamTurnIdsByLabel.get(providerSpeakerLabel) ?? [];
    if (turnIds.length > 0) {
      await relabelSessionTurns(this.sessionId, turnIds, correctedName);
    }
    useAriaStore
      .getState()
      .relabelUtterances(providerSpeakerLabel, correctedName);

    useAriaStore.getState().setNotice("Re-reading voices…");
    await this.stt?.restartRecognition();
    this.onSessionActivity?.();
  }
}
