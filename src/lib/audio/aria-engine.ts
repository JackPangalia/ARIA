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
import {
  safeSpeakerLabel,
  SpeechmaticsLiveClient,
  type SpeechmaticsSpeakerResult,
} from "./speechmatics-client";
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
import {
  VisualMicLevelNormalizer,
  playbackRmsToLevel,
} from "./visual-level";
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
import { learnSpeakerProfile, listSpeakerProfiles } from "@/lib/speakers/client";
import { selectReinforcementCandidates } from "@/lib/speakers/reinforcement";
import {
  mergeSessionSpeakerClusters,
  speakerClusterKey,
  type SessionSpeakerClusterSnapshot,
} from "@/lib/speakers/session-learning";
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
  CONVERSATION_TAIL_MS,
  CONVERSATION_WINDOW_MS,
  QUESTION_SETTLE_MS,
} from "@/lib/aria/conversation/wake";
import {
  assessQuestionCompleteness,
  graceMsFor,
  LOCAL_SPEECH_END_SETTLE_MS,
  settleMsFor,
  shouldForceEndpoint,
  shouldSpeculateAsk,
} from "@/lib/aria/conversation/endpointing";
import { joinText } from "@/lib/text/join-text";
import { useAriaStore } from "@/lib/store";
import type { TranscriptionMode } from "@/lib/sessions/types";
import type { AriaStatus, TranscriptUtterance } from "@/lib/types";

/** Beat after playback before the follow-up window opens. No longer gates the
 * mic — see `shouldSendMicToStt`. */
const PLAYBACK_STT_COOLDOWN_MS = 300;
const SPEAKER_SNAPSHOT_INTERVAL_MS = 30_000;
// Once somebody accepts the wake-free follow-up window, transcript/provider
// edge cases must not strand Kivo in capture forever. Refreshed whenever
// meaningful transcript text arrives; normal semantic endpointing resolves
// much sooner.
const FOLLOW_UP_CAPTURE_TIMEOUT_MS = 6_000;
// Once speech that started inside the follow-up window ends, keep the window
// open this much longer. Speechmatics finals lag the audio they describe by up
// to `max_delay` plus the end-of-utterance trigger, so the transcript that
// decides "was that a follow-up?" arrives about a second after the last word —
// closing on the local VAD's speech-end would drop it on a shut window.
const FOLLOW_UP_SPEECH_GRACE_MS = 2_000;
// Absolute cap on a held window, so a room the VAD never hears go quiet (a fan,
// a nearby conversation) can't strand Kivo on the "Follow-up" caption forever.
const FOLLOW_UP_MAX_HOLD_MS = 12_000;
// Cumulative speech a diarization label needs before it counts as a distinct
// person. Guards the one-on-one test below against a spurious cluster — a
// cough, a laugh, a half-second of crosstalk split off the main speaker —
// quietly turning a conversation into a "room".
const DISTINCT_SPEAKER_MIN_MS = 4_000;
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
/** Silence after which the local VAD *guesses* the turn ended and pre-warms an
 * answer. Cheap and reversible — nothing is sent to the speakers. */
const SPEECH_END_SPECULATE_MS = 200;
/** Silence after which the local VAD *commits* to the turn having ended (force
 * endpoint + re-arm dispatch). Must be long enough to clear a mid-sentence
 * breath; the speculation above keeps the wait off the critical path. */
const SPEECH_END_COMMIT_MS = 550;
/** After dispatch, how long the asker's continued speech still counts as "I
 * wasn't finished" rather than a new turn. */
const CONTINUATION_WINDOW_MS = 2_500;
const CONTEXT_PREFETCH_DEBOUNCE_MS = 400;
// Server-side AskBodySchema limits. A marathon monologue capture must degrade
// (keep the tail, where the actual ask lives) rather than 400 the whole turn.
/** Loose comparison form for "have we already heard these exact words?". */
function normalizeForContinuation(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

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
  /** Someone started speaking inside the follow-up window — the countdown is
   * paused until they stop, so a question is never cut off by the clock. */
  private followUpHeldBySpeech = false;
  /** The open floor has closed and the window is in its ask-only tail: still
   * listening for a wake-free turn, but only for a directed question. */
  private followUpAskOnly = false;
  /** When the current follow-up phase is due to end, so a speech hold can give
   * the phase its remaining time back instead of restarting or truncating it. */
  private followUpPhaseDeadlineMs = 0;
  /** What the live capture inherited from the window it was latched in: whether
   * the ask-only bar applies when the assembled question is dispatched. */
  private followUpCaptureContext: { askOnly: boolean } | null = null;
  private capturingFollowUp = false;
  /** Untouched copies of the utterances pulled into a wake-free follow-up
   * capture, so an abandoned capture can put them back in the transcript
   * instead of deleting real speech. */
  private capturedRawUtterances: TranscriptUtterance[] = [];
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
  private playbackAnalyser: AnalyserNode | null = null;
  private playbackTimeDomain: Uint8Array | null = null;
  private playbackMeterRaf = 0;
  private htmlAudioSource: MediaElementAudioSourceNode | null = null;
  private ducked = false;
  private isAssistantSpeaking = false;
  /** Words from a dispatch that was taken back mid-thought; they lead the next
   * capture so the reopened turn carries the whole question. */
  private capturePrefix = "";
  private capturePrefixSourceIds: string[] = [];
  /** One speculation probe per silent gap (reset on the next speech onset). */
  private speculationProbed = false;
  /** The last question sent for an answer, for the continuation path below. */
  private lastDispatch: {
    question: string;
    sourceUtteranceIds: string[];
    speaker: number | null;
    providerSpeakerLabel: string | null;
    atMs: number;
  } | null = null;
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
  /** The same detector as above, but only once its model is live — the handle
   * the barge-in gate needs to know a neural probability is worth trusting. */
  private neuralVad: SileroVadDetector | null = null;
  /** Last probability `observeLocalSpeech` computed, reused by the barge-in
   * gate so one frame is never run through the model twice. */
  private lastLocalSpeechProbability = 0;
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
  private speakerClusters: SessionSpeakerClusterSnapshot[] = [];
  // Positive reinforcement bookkeeping. Speech is counted per provider label
  // within a stream (labels are only meaningful inside one); the corrected and
  // reinforced sets are session-scoped, because a label the user rejected once
  // should stay untrusted even after a restart re-seeds the clusters.
  private attributedSpeechMsByLabel = new Map<string, number>();
  /** Cumulative speech per diarization label across the whole session, used
   * only to answer "is this a one-on-one or a room?". Deliberately separate
   * from `attributedSpeechMsByLabel`, which serves enrolled-profile
   * reinforcement, counts only named speakers, and resets with the STT stream —
   * room composition does not change because a socket blipped. */
  private sessionSpeechMsByLabel = new Map<string, number>();
  private correctedSpeakerLabels = new Set<string>();
  private reinforcedProfileIds = new Set<string>();
  private lastSpeakerSnapshotRequestAt = new Map<number, number>();
  private currentTurnTelemetry: VoiceTurnTelemetry | null = null;
  /** Cached at session start so speculative asks don't await AudioContext. */
  private playbackSampleRate: number | null = null;
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
    this.speakerClusters = [];
    this.lastSpeakerSnapshotRequestAt.clear();
    this.visualMicLevel.reset();
    store.setError(null);
    store.setStatus("listening");
    this.turnController.transition("listening");

    devLog("session", "Mic session started — transcript lines print here in dev.");

    try {
      await this.cues.ensureReady();
      this.playbackSampleRate = this.cues.sampleRate;
      // Neural VAD loads in parallel with STT connect; process() uses its RMS
      // fallback until the model is ready (or permanently if it never loads).
      const silero = new SileroVadDetector();
      this.localSpeechDetector = silero;
      this.neuralVad = silero;
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
        // it's been started (during playback); it's a no-op otherwise. It gets
        // the neural probability from the frame `observeLocalSpeech` just ran,
        // so a loud non-voice noise — a dropped coaster, a door — can't pass
        // for an interruption on volume alone.
        this.bargeIn.process(frame, this.neuralSpeechProbability());
        // The mic is never gated off. It used to go deaf for 300ms after
        // playback ended, which deleted the first word of an immediate
        // follow-up outright — the audio was dropped, not delayed, so nothing
        // downstream could recover it. (The same window also discarded whole
        // transcripts that merely *arrived* during it, even though STT finals
        // lag the audio they describe by up to `max_delay`.) Self-hearing is
        // handled where it belongs: results are split by audio-timeline
        // overlap with assistant speech, and overlapping text is dropped only
        // when it actually matches what Kivo said.
        this.stt?.sendPcm(frame);
      });
      this.startHeartbeat();
      // A backgrounded tab can lose the STT socket without a reconnectable
      // close firing while throttled; retry immediately on return.
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
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
        this.attributedSpeechMsByLabel.clear();
        if (this.stt) {
          this.lastSpeakerSnapshotRequestAt.set(
            this.stt.currentStreamEpoch,
            Date.now()
          );
        }
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
      onSpeakersResult: (speakers) => this.captureSpeakerResults(speakers),
    }, profiles, {
      transcriptionMode: this.transcriptionMode,
      voiceEngineV2: this.voiceEngineV2,
    });

    await this.stt.connect();
    return profiles.length;
  }

  async stop(): Promise<SessionSpeakerClusterSnapshot[]> {
    this.currentTurnTelemetry?.finish("aborted", { reason: "session_stop" });
    this.currentTurnTelemetry = null;
    this.localSpeechDetector.reset();
    this.lastLocalSpeechProbability = 0;
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
      if (this.transcriptionMode === "speaker") {
        const finalSpeakers = await this.stt.finishAndGetSpeakers();
        this.captureSpeakerResults(finalSpeakers);
      } else {
        this.stt.close();
      }
      this.stt = null;
    }
    useAriaStore.getState().setNotice(null);
    this.resetQuestionCapture();
    this.stopFollowUpWindow();
    this.clearFollowUpStartTimer();
    this.clearTurnFlushTimer();
    await this.flushPersistedSpeakerTurn();
    this.finalizeTitle();
    this.abortActiveFetch();
    this.stopPlayback();
    this.cues.stopWorkCue();
    void this.cues.dispose();
    this.visualMicLevel.reset();
    useAriaStore.getState().setMicLevel(0);
    useAriaStore.getState().setPlaybackLevel(0);
    useAriaStore.getState().setStatus("idle");
    return [...this.speakerClusters];
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

  /**
   * The neural speech probability for the frame just observed, or undefined
   * while the model is still loading (or if it failed) — in which case the
   * barge-in gate falls back to energy alone rather than gating on the RMS
   * fallback's probability, which is the same signal it already computes.
   */
  private neuralSpeechProbability(): number | undefined {
    return this.neuralVad?.isReady
      ? this.lastLocalSpeechProbability
      : undefined;
  }

  private observeLocalSpeech(frame: Int16Array): void {
    const activity = this.localSpeechDetector.process(frame);
    this.lastLocalSpeechProbability = activity.probability;
    const now = performance.now();
    if (activity.probability >= 0.42) {
      this.localSpeechLastPositiveMs = now;
      this.speculationProbed = false;
      if (!this.localSpeechActive) {
        this.localSpeechActive = true;
        // Somebody started talking inside the follow-up window. Freeze it: the
        // transcript that decides whether this is a follow-up lands up to a
        // second after the words, and letting the clock run through the
        // question is what left a perfectly good follow-up arriving at a
        // closed window — answered by a return to passive listening.
        if (this.followUpListening && !this.capturingQuestion) {
          this.holdFollowUpWindow();
        }
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

    if (!this.localSpeechActive) return;

    const silentMs = now - this.localSpeechLastPositiveMs;

    // Stage one: a short gap is enough to *guess* the turn is over, so start
    // generating an answer for the draft as it stands. Nothing is committed —
    // if the speaker keeps going, the speculation is torn down on the next
    // speech onset and re-issued. This is what pays for the patience below.
    if (
      !this.speculationProbed &&
      silentMs >= SPEECH_END_SPECULATE_MS &&
      this.capturingQuestion
    ) {
      this.speculationProbed = true;
      const draft = joinText(
        this.getCapturedQuestion().question,
        this.capturePartial
      );
      if (draft.trim()) this.maybeRefreshSpeculativeAsk(draft);
    }

    // Stage two: only a real pause — long enough that a person listening would
    // also think you were done — ends the turn. A 160ms gap used to, and it
    // fired inside normal speech (stop consonants, a breath, "um..."), which is
    // what cut the speaker off and what truncated trailing words when
    // ForceEndOfUtterance landed mid-word.
    if (silentMs >= SPEECH_END_COMMIT_MS) {
      this.localSpeechActive = false;
      if (this.followUpHeldBySpeech) {
        this.releaseFollowUpWindowHold();
      }
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

  /**
   * Semantic fast path (two-stage endpointing): the local VAD heard the voice
   * stop. Confident asks and yield closers tell Speechmatics to finalize now
   * instead of waiting out the 0.55s silence trigger. Briefings do not force —
   * a breath after a sentence is not a send — but they still pre-warm
   * generation. Dispatch always goes through graded grace on the final.
   */
  private maybeForceEndpoint() {
    if (this.endpointForced || !this.capturingQuestion) return;
    const draft = joinText(
      this.getCapturedQuestion().question,
      this.capturePartial
    );
    if (!draft.trim()) return;
    const completeness = assessQuestionCompleteness(draft);
    // Pre-warm even when we don't force — a briefing pause still wants
    // generation in flight behind the 0.55s acoustic wait.
    this.maybeRefreshSpeculativeAsk(draft);
    if (!shouldForceEndpoint(completeness, draft)) return;
    this.endpointForced = true;
    this.currentTurnTelemetry?.mark("endpoint_forced", { completeness });
    devLog("wake", `Voice stopped, draft reads ${completeness} — forcing endpoint.`);
    this.stt?.forceEndOfUtterance();
  }

  /**
   * Start or replace a held answer request for a draft that already reads as
   * a completed turn — including while the speaker is still finishing the last
   * words. Playback waits for endpoint confirm. A growing draft aborts the
   * stale request and starts a new one; a shrinking/flickering partial keeps
   * the in-flight (longer) guess. Unfinished drafts and first-wake statements
   * never fire.
   */
  private maybeRefreshSpeculativeAsk(draft: string): void {
    const question = sanitizeQuestionText(draft);
    if (!question || !isSubstantiveQuestion(question)) return;
    const completeness = assessQuestionCompleteness(question);
    if (!shouldSpeculateAsk(completeness, this.capturingFollowUp)) return;
    // A late follow-up that will fail the ask bar at dispatch must not pre-warm
    // an answer nobody will ever hear — that is a full LLM turn per stray
    // sentence.
    if (!this.resolvedFollowUpPassesAskBar(question)) return;

    const spec = this.speculativeAsk;
    if (spec) {
      if (questionsMatchForContext(spec.question, question)) return;
      const prev = sanitizeQuestionText(spec.question).toLowerCase();
      const next = question.toLowerCase();
      // STT often flickers a shorter partial; keep the longer in-flight ask.
      if (prev.startsWith(next)) return;
      this.abortSpeculativeAsk("draft_grew");
    }
    this.startSpeculativeAsk(question);
  }

  /**
   * Fire the answer request for a completed-looking ask *before* the endpoint
   * is confirmed. The server runs context → LLM → TTS immediately, so by the
   * time the endpoint grace elapses and `askAria` adopts this request, the
   * first audio is already on its way — hiding the LLM/TTS time-to-first-
   * audio behind the remaining speech and the endpoint window. The response
   * is held, not played.
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

    const responsePromise = Promise.resolve(
      askSessionQuestion(
        this.sessionId,
        question,
        captured.speaker,
        captured.speakerName,
        controller.signal,
        captured.sourceUtteranceIds,
        {
          acceptPcm: this.supportsPcmPlayback(),
          acceptMuxText: this.supportsPcmPlayback(),
          pcmSampleRate: this.playbackSampleRate ?? undefined,
          turnId: telemetry?.turnId,
          speculative: true,
          providerSpeakerLabel: captured.providerSpeakerLabel,
        }
      )
    );
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
    if (u.isFinal && u.speechFinal) this.creditSessionSpeech(u);
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
      wake.detected || (utteranceStable && this.acceptsAsFollowUp(u));
    const isQuestionCaptureUtterance = this.capturingQuestion || willEnterCapture;

    if (u.isFinal && u.speechFinal && !isQuestionCaptureUtterance) {
      void this.bufferSpeakerTurn(u);
    } else if (u.isFinal && u.speechFinal) {
      // Question audio is real speech from a real speaker; it just isn't
      // persisted here. Credit it anyway, or the person who asks the most —
      // usually the enrolled owner — never reaches the reinforcement
      // threshold and their profile stops improving.
      this.creditAttributedSpeech(u);
    }

    if (!this.capturingQuestion) {
      if (wake.detected) {
        this.handleWake(
          u.id,
          u.speaker,
          u.speakerName ?? null,
          u.providerSpeakerLabel ?? null
        );
      } else if (utteranceStable && this.acceptsAsFollowUp(u)) {
        this.handleFollowUp(
          u.id,
          u.speaker,
          u.speakerName ?? null,
          u.providerSpeakerLabel ?? null
        );
      } else if (this.isFollowUpReaction(u)) {
        this.handFloorBackToListening("reaction, not a question");
      }
    }

    if (!this.capturingQuestion) return;

    if (this.capturingFollowUp && u.text.trim()) {
      this.scheduleFollowUpCaptureTimeout();
      if (utteranceStable) this.rememberRawCaptureUtterance(u);
    }

    // Track the freshest partial for the semantic fast path; a stable
    // utterance supersedes it (its text lands in the settled draft below).
    if (!utteranceStable) {
      this.capturePartial = wake.detected ? wake.question : u.text.trim();
      this.maybeRefreshSpeculativeAsk(
        joinText(this.getCapturedQuestion().question, this.capturePartial)
      );
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
        this.maybeRefreshSpeculativeAsk(this.inlineQuestion);
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
        this.maybeRefreshSpeculativeAsk(this.getCapturedQuestion().question);
        this.scheduleQuestionResolution(
          this.settleDelayForDraft(u.speechFinal)
        );
      }
    }
  }

  /**
   * True when this utterance should be taken as a wake-free follow-up. The
   * window means "the next thing said is meant for Kivo" — but a listener's
   * "yeah", "makes sense" or "okay" is not an ask. Answering one wastes a turn
   * and, because capture keeps its text out of the transcript, deletes the
   * line as well. Those stay ordinary speech.
   */
  private creditSessionSpeech(u: TranscriptUtterance): void {
    const label = u.providerSpeakerLabel;
    if (!label || u.overlapsAssistantSpeech) return;
    const durationMs = Math.max(0, (u.end - u.start) * 1000);
    if (durationMs === 0) return;
    this.sessionSpeechMsByLabel.set(
      label,
      (this.sessionSpeechMsByLabel.get(label) ?? 0) + durationMs
    );
  }

  /**
   * True while Kivo has only ever heard one voice — a one-on-one, where
   * everything said near it is said *to* it, and going quiet on "yeah, I guess
   * that's valid" reads as the thing being broken. In a room (two or more
   * voices with real speech behind them) the late window stays question-only,
   * so Kivo doesn't interject into a conversation that isn't with it.
   *
   * Basic transcription has no labels at all, so it counts as one-on-one: the
   * user opted out of telling people apart, and answering is the friendlier
   * side of that trade.
   */
  private isOneOnOneSession(): boolean {
    let distinct = 0;
    for (const ms of this.sessionSpeechMsByLabel.values()) {
      if (ms >= DISTINCT_SPEAKER_MIN_MS) distinct += 1;
    }
    return distinct <= 1;
  }

  /** Whether the window is currently taking *anything* said, as opposed to
   * questions only. Drives the orb: the "Follow-up" caption must mean what it says. */
  private followUpWindowIsOpenFloor(): boolean {
    return !this.followUpAskOnly || this.isOneOnOneSession();
  }

  private acceptsAsFollowUp(u: TranscriptUtterance): boolean {
    if (!this.followUpListening) return false;
    const text = u.text.trim();
    if (text.length === 0) return false;
    // Only a *complete* utterance can be judged a reaction. Speechmatics emits
    // interim finals roughly every `max_delay`, so a long question arrives in
    // pieces — and the first piece is usually how people start talking: "okay
    // so", "I mean", "so I don't know". Grading those as reactions is what made
    // follow-ups fail exactly when you spoke for a while.
    if (u.speechFinal && isBackchannelOnly(text)) return false;
    return true;
  }

  /**
   * The ask-only bar for a late (tail) follow-up, applied to the *assembled*
   * question at dispatch rather than to the first fragment that arrived. A long
   * question splits across several finals and no single one of them reads as a
   * complete ask, so judging any one of them decides the wrong thing.
   */
  private resolvedFollowUpPassesAskBar(question: string): boolean {
    if (!this.followUpCaptureContext?.askOnly) return true;
    if (this.isOneOnOneSession()) return true;
    const completeness = assessQuestionCompleteness(question);
    return completeness === "clear-ask" || completeness === "likely-ask";
  }

  private acceptsResolvedFollowUp(question: string): boolean {
    const accepted = this.resolvedFollowUpPassesAskBar(question);
    if (!accepted) {
      devLog(
        "wake",
        `Not a late follow-up — reads ${assessQuestionCompleteness(
          question
        )}, left as transcript.`
      );
    }
    return accepted;
  }

  private rememberRawCaptureUtterance(u: TranscriptUtterance) {
    const idx = this.capturedRawUtterances.findIndex((x) => x.id === u.id);
    if (idx === -1) {
      this.capturedRawUtterances.push({ ...u });
      return;
    }
    this.capturedRawUtterances[idx] = { ...u };
  }

  /**
   * Put an abandoned follow-up capture back in the transcript. Capture
   * deliberately withholds its utterances (the server persists the resolved
   * question as the turn instead), but a capture that never resolves would
   * otherwise erase real speech outright — which is how room conversation
   * right after an answer went missing from the record.
   */
  /**
   * Tear down a capture that turned out not to be a question: the speech goes
   * back to the transcript and the floor goes back to the room.
   *
   * This used to reopen the window for whatever seconds were left, on the
   * theory that a stray sentence shouldn't eat the time in which the real
   * question was coming. In use that reads as broken — you say "that's
   * interesting", nothing happens, and the orb sits there implying it is still
   * waiting on a question you were never going to ask. Closing out loud is the
   * honest end of the exchange.
   */
  private abandonFollowUpCapture(reason: string) {
    this.clearCaptureFromLive();
    this.restoreAbandonedFollowUpCapture();
    this.resetQuestionCapture();
    this.turnController.transition("listening");
    this.handFloorBackToListening(reason);
  }

  /**
   * Close the conversation window, return to passive listening, and say so with
   * a cue: the next question needs the wake word again.
   *
   * Every caller here is the same situation: Kivo *heard* something and chose
   * not to answer it. Nothing visible happens on that path, so without a sound
   * it is indistinguishable from a failure. The window's own silent expiry does
   * not come through here — nothing was said, so there is nothing to
   * acknowledge, and a chime after every answer would be exactly the gadget
   * noise the cue design avoids.
   */
  private handFloorBackToListening(reason: string) {
    this.stopFollowUpWindow();
    useAriaStore.getState().setStatus("listening");
    this.cues.playRelease();
    devLog("wake", `Conversation window closed — ${reason}.`);
  }

  /**
   * A complete utterance inside the window that reads as a reaction to the
   * answer rather than a turn for Kivo: "that's interesting", "yeah, fair".
   * It belongs in the transcript and nowhere else — and it ends the exchange,
   * because someone who just responded to an answer is done with it.
   */
  private isFollowUpReaction(u: TranscriptUtterance): boolean {
    if (!this.followUpListening || this.capturingQuestion) return false;
    if (!u.isFinal || !u.speechFinal) return false;
    if (u.overlapsAssistantSpeech) return false;
    const text = u.text.trim();
    if (text.length === 0) return false;
    return isBackchannelOnly(text);
  }

  private restoreAbandonedFollowUpCapture() {
    const raw = this.capturedRawUtterances;
    this.capturedRawUtterances = [];
    if (raw.length === 0) return;
    const store = useAriaStore.getState();
    for (const u of raw) {
      store.upsertUtterance(u);
      void this.bufferSpeakerTurn(u);
    }
    devLog(
      "wake",
      `Follow-up abandoned — restored ${raw.length} utterance(s) to the transcript.`
    );
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
    // Playback already finished (the player is torn down on end) — only its
    // tail can still be echoing in the room. Matching against the *whole*
    // answer here made short openers ("how are", "so the") look like echo and
    // deleted the first words of a follow-up.
    if (played == null || played <= 0) return this.liveAnswerText.slice(-160);
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

    // Saying the name is content-level proof this is aimed at Kivo, so it
    // takes the floor on its own — no acoustic corroboration, no word-count
    // bar, and it works while Kivo is thinking as well as speaking. Volume is
    // what the energy detector needs; "Kivo" is what a person actually uses,
    // and they shouldn't have to shout it over the answer.
    if (wakeDetected) {
      this.handleTranscriptBargeIn(u, true, utteranceStable);
      return;
    }

    // Claude-style barge-in: sustained real speech while Kivo is audibly
    // speaking stops the answer and becomes the next question. While *thinking*
    // the bar is different: ambient room conversation must not cancel an answer
    // nothing is playing over, but the person who just asked carrying on with
    // their own sentence means we endpointed too early — take it back.
    if (useAriaStore.getState().status !== "speaking") {
      if (this.looksLikeContinuation(u, utteranceStable, wakeDetected)) {
        this.handleThinkingContinuation(u, utteranceStable);
      }
      return;
    }
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
   * True when this utterance reads like the asker still finishing the thought
   * we just dispatched — the "it cut me off" case. Deliberately narrow: the
   * same speaker, within a couple of seconds of dispatch, saying something
   * substantive. Anyone else in the room is ordinary conversation and must not
   * cancel the answer.
   */
  private looksLikeContinuation(
    u: TranscriptUtterance,
    utteranceStable: boolean,
    wakeDetected: boolean
  ): boolean {
    const dispatch = this.lastDispatch;
    if (!dispatch) return false;
    // A fresh wake word is a new turn, not the tail of the last one.
    if (wakeDetected) return false;
    if (Date.now() - dispatch.atMs > CONTINUATION_WINDOW_MS) return false;
    if (isBackchannelOnly(u.text)) return false;
    if (wordCount(u.text) < (utteranceStable ? 2 : 3)) return false;
    // Words already sent as part of the question don't come back as new speech.
    if (dispatch.sourceUtteranceIds.includes(u.id)) return false;
    // The question was captured from partials, so its final re-arrives under a
    // new id moments after dispatch. Same words, not new speech — cancelling on
    // it would loop the turn forever.
    const incoming = normalizeForContinuation(u.text);
    if (!incoming || normalizeForContinuation(dispatch.question).includes(incoming)) {
      return false;
    }
    if (dispatch.providerSpeakerLabel && u.providerSpeakerLabel) {
      return dispatch.providerSpeakerLabel === u.providerSpeakerLabel;
    }
    return dispatch.speaker == null || dispatch.speaker === u.speaker;
  }

  /**
   * Take back a dispatch the speaker wasn't done with. The in-flight answer is
   * aborted before anything reaches the speakers, and capture reopens seeded
   * with the question we already sent — so the finished thought is answered
   * once, whole, instead of its tail being answered as a second question on top
   * of an answer to the first half.
   */
  private handleThinkingContinuation(
    u: TranscriptUtterance,
    utteranceStable: boolean
  ) {
    const dispatch = this.lastDispatch;
    if (!dispatch) return;
    this.lastDispatch = null;
    devLog("wake", "Speaker kept going after dispatch — reopening capture.");
    this.currentTurnTelemetry?.mark("continuation_reopen", {
      sinceDispatchMs: Math.round(Date.now() - dispatch.atMs),
    });
    this.turnController.interrupt();
    this.abortActiveFetch();
    this.abortSpeculativeAsk("continuation");
    this.cues.stopWorkCue();
    this.currentTurnTelemetry?.finish("aborted", { reason: "continuation" });
    this.currentTurnTelemetry = null;
    this.handleFollowUp(
      u.id,
      u.speaker,
      u.speakerName ?? null,
      u.providerSpeakerLabel ?? null
    );
    // Set after handleFollowUp — it resets capture state.
    this.capturePrefix = dispatch.question;
    this.capturePrefixSourceIds = dispatch.sourceUtteranceIds;
    // This utterance was consumed here, so it never reaches the capture path.
    // Seed it like the barge-in path does; a partial's words re-deliver as a
    // clean final and would duplicate, so only stable text is seeded.
    if (utteranceStable) {
      this.inlineQuestion = u.text.trim();
      this.scheduleQuestionResolution(this.settleDelayForDraft(u.speechFinal));
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
      // for `end_of_utterance_silence_trigger`. Residual grace after that is
      // semantic, not acoustic: a finished turn dispatches almost immediately,
      // a first-wake briefing waits a medium beat, and a tail like "...and the"
      // means they're pausing to think — hold long enough for the thought to
      // land instead of answering mid-sentence. Context was already prefetched
      // while capturing, so we skip re-scheduling it here.
      const completeness = assessQuestionCompleteness(draft);
      const graceMs = graceMsFor(completeness, this.capturingFollowUp);
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
    }
    // A fresh wake supersedes any half-finished capture — clear its live
    // fragments so they don't strand in the transcript.
    this.clearCaptureFromLive();
    this.stopFollowUpWindow();
    this.clearQuestionSettleTimer();
    this.questionUtterances = [];
    // A superseded capture's words are already dropped from the live
    // transcript above; forget them here too, or a later abandonment would
    // restore the wrong turn's speech.
    this.capturedRawUtterances = [];
    this.inlineQuestion = "";
    this.capturePrefix = "";
    this.capturePrefixSourceIds = [];
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
    this.armAnswerPlayback(ctx, answerGain);

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
    this.stopPlaybackTap();
    if (this.htmlAudioSource) {
      try {
        this.htmlAudioSource.disconnect();
      } catch {
        // ignore
      }
      this.htmlAudioSource = null;
    }
    if (this.answerGain) {
      try {
        this.answerGain.disconnect();
      } catch {
        // ignore
      }
      this.answerGain = null;
    }
  }

  /** Route answer audio through a tap so the word ring can pulse off Kivo's
   * actual voice, not the AEC-ducked room mic. */
  private armAnswerPlayback(ctx: AudioContext, answerGain: GainNode) {
    this.answerGain = answerGain;
    this.ducked = false;
    this.armPlaybackTap(ctx, answerGain);
  }

  private armPlaybackTap(ctx: AudioContext, answerGain: GainNode) {
    this.stopPlaybackTap();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.28;
    answerGain.connect(analyser);
    this.playbackAnalyser = analyser;
    this.playbackTimeDomain = new Uint8Array(analyser.fftSize);
    const tick = () => {
      const node = this.playbackAnalyser;
      const samples = this.playbackTimeDomain;
      if (!node || !samples) {
        this.playbackMeterRaf = 0;
        return;
      }
      node.getByteTimeDomainData(
        samples as Parameters<AnalyserNode["getByteTimeDomainData"]>[0],
      );
      const level = this.isAssistantSpeaking
        ? playbackRmsToLevel(samples)
        : 0;
      useAriaStore.getState().setPlaybackLevel(level);
      this.playbackMeterRaf = requestAnimationFrame(tick);
    };
    this.playbackMeterRaf = requestAnimationFrame(tick);
  }

  private stopPlaybackTap() {
    if (this.playbackMeterRaf) {
      cancelAnimationFrame(this.playbackMeterRaf);
      this.playbackMeterRaf = 0;
    }
    if (this.playbackAnalyser) {
      try {
        this.playbackAnalyser.disconnect();
      } catch {
        // ignore
      }
      this.playbackAnalyser = null;
    }
    this.playbackTimeDomain = null;
    useAriaStore.getState().setPlaybackLevel(0);
  }

  private async routeHtmlAudioThroughTap(audio: HTMLAudioElement) {
    try {
      const playback = await this.cues.getPlaybackContext();
      if (!playback || this.currentAudio !== audio) return;
      const answerGain = playback.ctx.createGain();
      answerGain.gain.value = 1;
      answerGain.connect(playback.master);
      const source = playback.ctx.createMediaElementSource(audio);
      source.connect(answerGain);
      this.htmlAudioSource = source;
      this.armAnswerPlayback(playback.ctx, answerGain);
    } catch {
      // Keep the element's default output; the ring just won't hear this path.
    }
  }

  /** Return the mic to its configured base after playback. V2 keeps AEC on so
   * live speaker matching stays in the same acoustic domain as enrollment;
   * this call is still safe and useful for non-V2/base configurations. */
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
    this.followUpCaptureContext = this.followUpListening
      ? { askOnly: this.followUpAskOnly }
      : null;
    this.stopFollowUpWindow();
    this.clearQuestionSettleTimer();
    this.questionUtterances = [];
    // A superseded capture's words are already dropped from the live
    // transcript above; forget them here too, or a later abandonment would
    // restore the wrong turn's speech.
    this.capturedRawUtterances = [];
    this.inlineQuestion = "";
    this.capturePrefix = "";
    this.capturePrefixSourceIds = [];
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
      this.capturePrefix.trim(),
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
        [
          ...this.capturePrefixSourceIds,
          this.wakeUtteranceId,
          ...this.questionUtterances.map((u) => u.id),
        ].filter(
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
    return settleMsFor(
      assessQuestionCompleteness(this.getCapturedQuestion().question),
      this.capturingFollowUp
    );
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
      const requiredMs = graceMsFor(
        assessQuestionCompleteness(question),
        this.capturingFollowUp
      );
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
      this.abandonFollowUpCapture("nothing substantive to answer");
      return;
    }
    if (!this.acceptsResolvedFollowUp(question)) {
      this.abandonFollowUpCapture("late follow-up is not a question");
      return;
    }
    const captured = this.getCapturedQuestion();
    // Remember what went out: if this speaker keeps talking over the next
    // couple of seconds, they weren't finished and the dispatch is taken back.
    this.lastDispatch = {
      question: captured.question,
      sourceUtteranceIds: captured.sourceUtteranceIds,
      speaker: captured.speaker,
      providerSpeakerLabel: captured.providerSpeakerLabel,
      atMs: Date.now(),
    };
    await this.askAndReset(
      captured.question,
      captured.speaker,
      captured.speakerName,
      captured.sourceUtteranceIds,
      captured.providerSpeakerLabel
    );
  }

  private async askAndReset(
    question: string,
    speaker: number | null,
    speakerName: string | null,
    sourceUtteranceIds: string[],
    providerSpeakerLabel: string | null = null
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
      adopted,
      providerSpeakerLabel
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
    this.followUpCaptureContext = null;
    this.capturedRawUtterances = [];
    this.questionUtterances = [];
    this.capturePartial = "";
    this.endpointForced = false;
    this.wakeUtteranceId = null;
    this.wakeSpeaker = null;
    this.wakeSpeakerName = null;
    this.wakeProviderSpeakerLabel = null;
    this.inlineQuestion = "";
    this.capturePrefix = "";
    this.capturePrefixSourceIds = [];
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
    } | null = null,
    providerSpeakerLabel: string | null = null
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
            pcmSampleRate: this.playbackSampleRate ?? undefined,
            turnId: telemetry.turnId,
            providerSpeakerLabel,
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
    this.armAnswerPlayback(ctx, answerGain);

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

    let destination: AudioNode | undefined;
    const playback = await this.cues.getPlaybackContext();
    if (playback && generation === this.playbackGeneration) {
      const answerGain = playback.ctx.createGain();
      answerGain.gain.value = 1;
      answerGain.connect(playback.master);
      this.armAnswerPlayback(playback.ctx, answerGain);
      destination = answerGain;
    }

    const handle = await this.cues.playClip(buf, {
      destination,
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
        this.teardownBargeIn();
        this.stt?.markAssistantSpeechEnd();
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
        this.teardownBargeIn();
        this.stt?.markAssistantSpeechEnd();
        this.cues.stopWorkCue();
        const msg = err instanceof Error ? err.message : "Audio playback error";
        useAriaStore.getState().setError(msg);
        this.currentTurnTelemetry?.finish("failed", { message: msg });
        this.currentTurnTelemetry = null;
      },
    });

    if (!handle) {
      if (generation === this.playbackGeneration) this.teardownBargeIn();
      return;
    }
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
      this.cues.stopWorkCue();
      useAriaStore.getState().setError("Audio playback error");
      this.currentTurnTelemetry?.finish("failed", {
        message: "Audio playback error",
      });
      this.currentTurnTelemetry = null;
    };
    void this.routeHtmlAudioThroughTap(audio).then(() => {
      if (this.currentAudio !== audio) return;
      void audio.play().catch((err) => {
        if (this.currentAudio !== audio) return;
        const msg = err instanceof Error ? err.message : "play failed";
        useAriaStore.getState().setError(msg);
      });
    });
    devLog("tts", logMessage);
  }

  private startFollowUpWindow() {
    this.stopFollowUpWindow();
    this.followUpListening = true;
    this.followUpAskOnly = false;
    useAriaStore.getState().setStatus("follow-up-listening");
    // Conversation mode: after an answer the session stays open — anything
    // said in this window is the next turn, no wake word, like a hands-free
    // Claude voice conversation. Renewed after every answer; ended by a
    // stop/close command or by this much silence. The countdown only measures
    // silence: once someone starts speaking it is held (see
    // `holdFollowUpWindow`), so it can expire before a question but never
    // during one.
    this.armFollowUpTimer(CONVERSATION_WINDOW_MS);
    // The window can open while someone is already mid-sentence — an immediate
    // follow-up started before Kivo finished, or the echo tail of the answer
    // itself. There is no onset left to wait for, so hold it now; the next
    // speech-end releases it either way.
    if (this.localSpeechActive) this.holdFollowUpWindow();
    devLog("wake", "Conversation window open.");
  }

  private armFollowUpTimer(
    delayMs: number,
    options: { keepDeadline?: boolean } = {}
  ) {
    if (this.followUpTimer) clearTimeout(this.followUpTimer);
    if (!options.keepDeadline) {
      this.followUpPhaseDeadlineMs = Date.now() + delayMs;
    }
    this.followUpTimer = setTimeout(() => this.endFollowUpPhase(), delayMs);
  }

  /** Only revert the status if nothing else has taken over — wake/think/speak
   * all set their own, so we no-op in those cases. */
  private returnOrbToPassiveListening() {
    if (useAriaStore.getState().status !== "follow-up-listening") return;
    useAriaStore.getState().setStatus("listening");
  }

  private endFollowUpPhase() {
    this.followUpTimer = null;
    this.followUpHeldBySpeech = false;

    if (!this.followUpAskOnly) {
      // The open floor is over, but the conversation isn't. Drop the orb back
      // to passive listening and keep taking a wake-free turn for a while
      // longer — from a directed question only. A person listens to a long
      // answer before deciding what to ask, and cutting them off here is what
      // met an ordinary follow-up with silence.
      this.followUpAskOnly = true;
      this.armFollowUpTimer(CONVERSATION_TAIL_MS);
      // The "Follow-up" caption has to mean what it says. In a one-on-one the
      // tail is still an open floor, so the orb stays; in a room it narrows to
      // questions only, which is close enough to passive listening that
      // claiming otherwise misleads.
      if (!this.followUpWindowIsOpenFloor()) {
        this.returnOrbToPassiveListening();
        devLog("wake", "Conversation window narrowed to direct questions.");
        return;
      }
      devLog("wake", "Conversation window still open — one-on-one.");
      return;
    }

    this.followUpListening = false;
    this.followUpAskOnly = false;
    this.returnOrbToPassiveListening();
    devLog("wake", "Conversation window closed.");
  }

  /** Pause the follow-up countdown while somebody is mid-utterance. */
  private holdFollowUpWindow() {
    if (this.followUpHeldBySpeech) return;
    this.followUpHeldBySpeech = true;
    // The phase keeps its own deadline: a hold pauses the countdown, it does
    // not hand the phase a fresh twelve seconds.
    this.armFollowUpTimer(FOLLOW_UP_MAX_HOLD_MS, { keepDeadline: true });
    devLog("wake", "Speech in the conversation window — holding it open.");
  }

  /** Speech ended without the transcript arriving yet: keep the window open
   * long enough for the trailing final, then let it close normally. */
  private releaseFollowUpWindowHold() {
    this.followUpHeldBySpeech = false;
    if (!this.followUpListening || this.capturingQuestion) return;
    // Give the phase back whatever it had left, but never less than the time
    // the trailing final transcript needs to arrive.
    const remainingMs = this.followUpPhaseDeadlineMs - Date.now();
    this.armFollowUpTimer(Math.max(FOLLOW_UP_SPEECH_GRACE_MS, remainingMs));
  }

  private clearFollowUpStartTimer() {
    if (!this.followUpStartTimer) return;
    clearTimeout(this.followUpStartTimer);
    this.followUpStartTimer = null;
  }

  private stopFollowUpWindow() {
    this.clearFollowUpStartTimer();
    this.followUpListening = false;
    this.followUpHeldBySpeech = false;
    this.followUpAskOnly = false;
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
      this.abandonFollowUpCapture("capture timed out");
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
    // A turn that is nothing but a reaction ("Oh.", "Yeah.") or one of the
    // stock phrases STT hallucinates over room noise ("Thank you.") is not
    // speech worth a transcript line — and, given each one seeds its own
    // diarization cluster, it invents a phantom speaker on the way in. Mark it
    // consumed so it can't come back, and drop it.
    if (isBackchannelOnly(text)) {
      for (const id of turn.sourceUtteranceIds) {
        this.persistedUtteranceIds.add(id);
      }
      return;
    }

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
        this.creditAttributedSpeech(u);
      }
      this.maybeRequestSpeakerSnapshot();
      this.onSessionActivity?.();
    } catch (err) {
      for (const id of turn.sourceUtteranceIds) {
        this.persistedUtteranceIds.delete(id);
      }
      const msg = err instanceof Error ? err.message : "unknown error";
      devLog("session", `Failed to persist speaker turn: ${msg}`);
    }
  }

  /**
   * Counts how much real speech a provider label has carried in this stream.
   * Echo is excluded — Kivo's own voice coming back through the mic would
   * otherwise inflate whichever cluster absorbed it toward the learn
   * threshold, and that cluster is precisely the one we must never learn from.
   */
  private creditAttributedSpeech(u: TranscriptUtterance): void {
    const label = u.providerSpeakerLabel;
    if (!label || u.overlapsAssistantSpeech) return;
    if (!u.speakerName) return;
    const durationMs = Math.max(0, (u.end - u.start) * 1000);
    if (durationMs === 0) return;
    this.attributedSpeechMsByLabel.set(
      label,
      (this.attributedSpeechMsByLabel.get(label) ?? 0) + durationMs
    );
  }

  /**
   * Folds this stream's voiceprint back into any profile that has been getting
   * attributed correctly for a sustained stretch, so a profile keeps improving
   * from sessions that went *right* rather than only from corrections.
   */
  private async reinforceEnrolledProfiles(): Promise<void> {
    if (this.transcriptionMode !== "speaker") return;
    if (this.enrolledProfiles.length === 0) return;

    // Key by the label we actually sent Speechmatics — it normalises whitespace
    // and rewrites S-prefixed names, so a display name is not always its label.
    const profilesByLabel = new Map(
      this.enrolledProfiles.map(
        (profile) =>
          [
            safeSpeakerLabel(profile.name),
            { id: profile.id, name: profile.name },
          ] as const
      )
    );
    // Clusters from earlier streams share labels with the current one but were
    // built from different audio; the speech tally is per stream, so pairing it
    // with a stale cluster's print would learn the wrong sample.
    const epoch = this.stt?.currentStreamEpoch ?? 1;
    const candidates = selectReinforcementCandidates({
      clusters: this.speakerClusters.filter(
        (cluster) => cluster.streamEpoch === epoch
      ),
      attributedMsByLabel: this.attributedSpeechMsByLabel,
      profilesByLabel,
      correctedLabels: this.correctedSpeakerLabels,
      alreadyReinforced: this.reinforcedProfileIds,
    });

    for (const candidate of candidates) {
      // Claim the slot before awaiting: snapshots overlap, and learning the
      // same print twice would spend two rotation slots on one sample.
      this.reinforcedProfileIds.add(candidate.profileId);
      try {
        const updated = await learnSpeakerProfile({
          name: candidate.profileName,
          speakerIdentifiers: [candidate.identifier],
        });
        this.enrolledProfiles = this.enrolledProfiles.map((profile) =>
          profile.id === updated.id ? updated : profile
        );
        devLog(
          "speaker",
          `Reinforced voiceprint for ${candidate.profileName} (${updated.speakerIdentifiers.length} prints stored).`
        );
      } catch (err) {
        this.reinforcedProfileIds.delete(candidate.profileId);
        const msg = err instanceof Error ? err.message : "unknown error";
        devLog("speaker", `Voiceprint reinforcement failed: ${msg}`);
      }
    }
  }

  private captureSpeakerResults(
    speakers: SpeechmaticsSpeakerResult[]
  ): void {
    if (speakers.length === 0) return;
    this.speakerClusters = mergeSessionSpeakerClusters(
      this.speakerClusters,
      speakers.map((speaker) => ({
        clusterKey: speakerClusterKey(
          speaker.streamEpoch,
          speaker.label
        ),
        streamEpoch: speaker.streamEpoch,
        providerSpeakerLabel: speaker.label,
        speakerIdentifiers: speaker.speakerIdentifiers,
      }))
    );
    void this.reinforceEnrolledProfiles();
  }

  private maybeRequestSpeakerSnapshot(): void {
    if (this.transcriptionMode !== "speaker" || !this.stt?.isConnected) return;
    const epoch = this.stt.currentStreamEpoch;
    const now = Date.now();
    const last = this.lastSpeakerSnapshotRequestAt.get(epoch) ?? 0;
    if (now - last < SPEAKER_SNAPSHOT_INTERVAL_MS) return;
    this.lastSpeakerSnapshotRequestAt.set(epoch, now);
    this.stt.requestSpeakers();
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
    /**
     * The profile just written by the learn endpoint, if any. Seeding it into
     * the restarted stream is what makes a correction stick for the rest of
     * the session instead of only fixing the transcript after the fact.
     */
    learnedProfile?: SpeakerProfileDoc | null;
  }): Promise<void> {
    const { providerSpeakerLabel, correctedName, learnedProfile } = input;
    // This cluster produced a label the user rejected, so it must never feed
    // automatic reinforcement — not even after a restart reshuffles clusters.
    this.correctedSpeakerLabels.add(providerSpeakerLabel);
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

    if (learnedProfile) {
      this.enrolledProfiles = [
        learnedProfile,
        ...this.enrolledProfiles.filter(
          (profile) => profile.id !== learnedProfile.id
        ),
      ];
      this.stt?.setSpeakerProfiles(this.enrolledProfiles);
    }

    useAriaStore.getState().setNotice("Re-reading voices…");
    await this.stt?.restartRecognition();
    this.onSessionActivity?.();
  }
}
