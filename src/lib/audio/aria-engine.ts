"use client";

import { CueEngine } from "./cue-engine";
import { MicPcmStreamer } from "./mic-pcm-streamer";
import { SpeechmaticsLiveClient } from "./speechmatics-client";
import {
  TranscriptTurnAssembler,
  type AssembledTranscriptTurn,
} from "./turn-assembler";
import { devLog } from "@/lib/client/dev-log";
import {
  askSessionQuestion,
  appendSessionTurn,
  prefetchSessionContext,
} from "@/lib/sessions/client";
import { listSpeakerProfiles } from "@/lib/speakers/client";
import { sendHeartbeat } from "@/lib/plan/client";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/plan/tiers";
import { sanitizeQuestionText } from "@/lib/aria/context/question-text";
import {
  extractQuestionAfterWake,
  isSubstantiveQuestion,
  END_OF_UTTERANCE_GRACE_MS,
  FOLLOW_UP_WINDOW_MS,
  QUESTION_SETTLE_MS,
  SPEECH_FINAL_SETTLE_MS,
} from "@/lib/aria/conversation/wake";
import { joinText } from "@/lib/text/join-text";
import { messagesToText, useAriaStore } from "@/lib/store";
import type { TranscriptUtterance } from "@/lib/types";

const PLAYBACK_STT_COOLDOWN_MS = 800;
const TURN_IDLE_FLUSH_MS = 1800;
const CONTEXT_PREFETCH_DEBOUNCE_MS = 400;

function pcmLevel(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i] / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / pcm.length);
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
  onSessionActivity?: () => void;
  /** Called when the listening budget runs out mid-session (engine auto-stops). */
  onUsageExhausted?: () => void;
};

export class AriaEngine {
  private sessionId: string;
  private onSessionActivity?: () => void;
  private persistedUtteranceIds = new Set<string>();
  private stt: SpeechmaticsLiveClient | null = null;
  private mic: MicPcmStreamer | null = null;
  private capturingQuestion = false;
  private questionUtterances: TranscriptUtterance[] = [];
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
  private captureWholeAnchorUtterance = false;
  private activeFetchAbort: AbortController | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  private currentClipStop: (() => void) | null = null;
  private playbackGeneration = 0;
  private cues = new CueEngine();
  private isAssistantSpeaking = false;
  private suppressSttUntilMs = 0;
  private turnAssembler = new TranscriptTurnAssembler();
  private turnFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private onUsageExhausted?: () => void;

  constructor(options: AriaEngineOptions) {
    this.sessionId = options.sessionId;
    this.onSessionActivity = options.onSessionActivity;
    this.onUsageExhausted = options.onUsageExhausted;
  }

  async start() {
    const store = useAriaStore.getState();
    store.setError(null);
    store.setStatus("listening");

    devLog("session", "Mic session started — transcript lines print here in dev.");

    try {
      await this.cues.ensureReady();
      await this.connectStt();
      this.mic = new MicPcmStreamer();
      await this.mic.start((frame) => {
        useAriaStore.getState().setMicLevel(pcmLevel(frame));
        if (this.shouldSendMicToStt()) {
          this.stt?.sendPcm(frame);
        }
      });
      this.startHeartbeat();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      this.cues.playError();
      useAriaStore.getState().setError(msg);
      await this.stop();
    }
  }

  private async connectStt() {
    const profiles = await listSpeakerProfiles().catch((err) => {
      devLog(
        "speaker",
        `Could not load saved speaker profiles: ${
          err instanceof Error ? err.message : "unknown error"
        }`
      );
      return [];
    });

    this.stt = new SpeechmaticsLiveClient({
      onOpen: () => {
        /* noop */
      },
      onClose: () => {
        /* noop */
      },
      onError: (err) => {
        devLog("speechmatics", err.message);
        useAriaStore.getState().setError(err.message);
      },
      onUtterance: (u) => this.handleUtterance(u),
      onUtteranceEnd: () => this.handleUtteranceEnd(),
    }, profiles);

    await this.stt.connect();
  }

  async stop() {
    this.stopHeartbeat();
    await this.mic?.stop();
    this.mic = null;
    if (this.stt) {
      this.stt.close();
      this.stt = null;
    }
    this.resetQuestionCapture();
    this.stopFollowUpWindow();
    this.clearFollowUpStartTimer();
    this.clearTurnFlushTimer();
    void this.flushPersistedSpeakerTurn();
    this.abortActiveFetch();
    this.stopPlayback();
    this.cues.stopThinkingLoop();
    void this.cues.dispose();
    useAriaStore.getState().setMicLevel(0);
    useAriaStore.getState().setStatus("idle");
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
    return !this.isAssistantSpeaking && Date.now() >= this.suppressSttUntilMs;
  }

  private shouldIgnoreIncomingUtterance(): boolean {
    return !this.shouldSendMicToStt();
  }

  private handleUtterance(u: TranscriptUtterance) {
    if (this.shouldIgnoreIncomingUtterance()) {
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
    if (u.isFinal && u.speechFinal) {
      void this.bufferSpeakerTurn(u);
    }
    const wake = extractQuestionAfterWake(u.text);
    const utteranceStable = u.speechFinal || u.isFinal;

    if (!this.capturingQuestion && utteranceStable) {
      if (wake.detected) {
        this.handleWake(
          u.id,
          u.speaker,
          u.speakerName ?? null,
          u.providerSpeakerLabel ?? null
        );
      } else if (this.followUpListening && u.text.trim().length > 0) {
        this.handleFollowUp(
          u.id,
          u.speaker,
          u.speakerName ?? null,
          u.providerSpeakerLabel ?? null
        );
      }
    }

    if (!this.capturingQuestion) return;

    if (this.wakeUtteranceId === u.id) {
      if (wake.detected) {
        this.inlineQuestion = wake.question;
      } else if (this.captureWholeAnchorUtterance) {
        this.inlineQuestion = u.text.trim();
      }
      if (this.inlineQuestion) {
        this.scheduleQuestionResolution(
          u.speechFinal ? SPEECH_FINAL_SETTLE_MS : QUESTION_SETTLE_MS
        );
      }
      return;
    }

    this.upsertQuestionUtterance({
      ...u,
      text: wake.detected ? wake.question : u.text,
    });
    if (this.getCapturedQuestion().question.length > 0) {
      this.scheduleQuestionResolution(
        u.speechFinal ? SPEECH_FINAL_SETTLE_MS : QUESTION_SETTLE_MS
      );
    }
  }

  private handleUtteranceEnd() {
    void this.flushPersistedSpeakerTurn();
    if (!this.capturingQuestion) return;

    if (this.getCapturedQuestion().question.length > 0) {
      // Speechmatics has detected end-of-turn — the speaker has gone silent for
      // `end_of_utterance_silence_trigger`. Trust it: collapse any pending long
      // settle timer to a short grace so we dispatch quickly instead of waiting
      // the full QUESTION_SETTLE_MS from the last transcript. Context was already
      // prefetched while capturing, so we skip re-scheduling it here.
      this.scheduleQuestionResolution(END_OF_UTTERANCE_GRACE_MS, {
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
    if (
      store.status === "thinking" ||
      store.status === "speaking" ||
      store.status === "capturing-question"
    ) {
      // Barge-in: stop Kivo and start capturing a fresh question.
      this.stopPlayback();
      this.abortActiveFetch();
      this.cues.stopThinkingLoop();
    }
    this.stopFollowUpWindow();
    this.clearQuestionSettleTimer();
    this.questionUtterances = [];
    this.inlineQuestion = "";
    this.wakeUtteranceId = utteranceId;
    this.wakeSpeaker = speaker;
    this.wakeSpeakerName = speakerName;
    this.wakeProviderSpeakerLabel = providerSpeakerLabel;
    this.captureWholeAnchorUtterance = false;
    this.capturingQuestion = true;
    this.cues.playWake();
    store.setStatus("capturing-question");
    devLog("wake", "Wake phrase detected — say your question (or continue).");
  }

  private handleFollowUp(
    utteranceId: string,
    speaker: number,
    speakerName: string | null,
    providerSpeakerLabel: string | null
  ) {
    const store = useAriaStore.getState();
    this.stopFollowUpWindow();
    this.clearQuestionSettleTimer();
    this.questionUtterances = [];
    this.inlineQuestion = "";
    this.wakeUtteranceId = utteranceId;
    this.wakeSpeaker = speaker;
    this.wakeSpeakerName = speakerName;
    this.wakeProviderSpeakerLabel = providerSpeakerLabel;
    this.captureWholeAnchorUtterance = true;
    this.capturingQuestion = true;
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
  } {
    const parts = [
      this.inlineQuestion.trim(),
      ...this.questionUtterances.map((u) => u.text.trim()),
    ].filter(Boolean);

    let merged = "";
    for (const part of parts) {
      merged = joinText(merged, part);
    }

    return {
      question: sanitizeQuestionText(merged),
      speaker: this.wakeSpeaker ?? this.questionUtterances[0]?.speaker ?? null,
      speakerName:
        this.wakeSpeakerName ?? this.questionUtterances[0]?.speakerName ?? null,
      providerSpeakerLabel:
        this.wakeProviderSpeakerLabel ??
        this.questionUtterances[0]?.providerSpeakerLabel ??
        null,
    };
  }

  private scheduleQuestionResolution(
    delayMs: number,
    options: { prefetch?: boolean } = {}
  ) {
    this.clearQuestionSettleTimer();
    if (options.prefetch ?? true) {
      this.scheduleContextPrefetch();
    }
    this.questionSettleTimer = setTimeout(() => {
      this.questionSettleTimer = null;
      const { question } = this.getCapturedQuestion();
      if (!question) return;
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
      void prefetchSessionContext(this.sessionId, draft).catch(() => {
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
    if (!isSubstantiveQuestion(question)) {
      this.resetQuestionCapture();
      useAriaStore.getState().setStatus("listening");
      return;
    }
    const captured = this.getCapturedQuestion();
    await this.askAndReset(
      captured.question,
      captured.speaker,
      captured.speakerName
    );
  }

  private async askAndReset(
    question: string,
    speaker: number | null,
    speakerName: string | null
  ) {
    await this.flushPersistedSpeakerTurn();
    this.resetQuestionCapture();
    const cleanQuestion = sanitizeQuestionText(question);
    if (!cleanQuestion) return;
    await this.askAria(cleanQuestion, speaker, speakerName);
  }

  private resetQuestionCapture() {
    this.clearQuestionSettleTimer();
    this.capturingQuestion = false;
    this.questionUtterances = [];
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
    speakerName: string | null
  ) {
    const store = useAriaStore.getState();
    store.setStatus("thinking");
    this.cues.startThinkingLoop();

    this.abortActiveFetch();
    const controller = new AbortController();
    this.activeFetchAbort = controller;

    try {
      const clientT0 = performance.now();
      devLog("pipeline", "fetch_start", { ms: 0 });

      const res = await askSessionQuestion(
        this.sessionId,
        question,
        speaker,
        speakerName,
        controller.signal
      );

      devLog("pipeline", "response_headers", {
        ms: Math.round(performance.now() - clientT0),
        status: res.status,
        ok: res.ok,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Ask failed: ${res.status} ${errText}`);
      }

      await this.playAudioResponse(res, "Playing spoken answer in browser.", {
        enableFollowUp: true,
        clientT0,
      });
      this.onSessionActivity?.();
    } catch (err) {
      this.cues.stopThinkingLoop();
      if (err instanceof DOMException && err.name === "AbortError") {
        devLog("ask", "Ask request aborted.");
        return;
      }
      const msg = err instanceof Error ? err.message : "unknown";
      devLog("error", msg);
      this.cues.playError();
      useAriaStore.getState().setError(msg);
    } finally {
      if (this.activeFetchAbort === controller) {
        this.activeFetchAbort = null;
      }
    }
  }

  private async playAudioResponse(
    res: Response,
    logMessage: string,
    options: { enableFollowUp?: boolean; clientT0?: number } = {}
  ) {
    if (!res.body) {
      throw new Error("Audio response has no body");
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

    const sourceBuffer = await sourceOpen;
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
        this.cues.stopThinkingLoop();
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
        this.suppressSttUntilMs = Date.now() + PLAYBACK_STT_COOLDOWN_MS;
        useAriaStore.getState().setStatus("listening");
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
        this.suppressSttUntilMs = Date.now() + PLAYBACK_STT_COOLDOWN_MS;
        this.cues.stopThinkingLoop();
        this.cues.playError();
        const msg = err instanceof Error ? err.message : "Audio playback error";
        useAriaStore.getState().setError(msg);
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
      this.cues.stopThinkingLoop();
      useAriaStore.getState().setStatus("speaking");
      if (options.clientT0 != null) {
        devLog("pipeline", "speaking", {
          ms: Math.round(performance.now() - options.clientT0),
        });
      }
    };
    audio.onended = () => {
      if (this.currentAudio !== audio) return;
      revoke();
      this.currentAudio = null;
      this.currentAudioUrl = null;
      this.isAssistantSpeaking = false;
      this.suppressSttUntilMs = Date.now() + PLAYBACK_STT_COOLDOWN_MS;
      useAriaStore.getState().setStatus("listening");
      if (options.enableFollowUp) {
        this.followUpStartTimer = setTimeout(() => {
          this.followUpStartTimer = null;
          this.startFollowUpWindow();
        }, PLAYBACK_STT_COOLDOWN_MS);
      }
    };
    audio.onerror = () => {
      if (this.currentAudio !== audio) return;
      revoke();
      this.currentAudio = null;
      this.currentAudioUrl = null;
      this.isAssistantSpeaking = false;
      this.suppressSttUntilMs = Date.now() + PLAYBACK_STT_COOLDOWN_MS;
      this.cues.stopThinkingLoop();
      this.cues.playError();
      useAriaStore.getState().setError("Audio playback error");
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
    this.followUpTimer = setTimeout(() => {
      this.followUpListening = false;
      this.followUpTimer = null;
      // Only revert if nothing else has taken over (wake/think/speak all
      // explicitly set their own status, so we just no-op in those cases).
      if (useAriaStore.getState().status === "follow-up-listening") {
        useAriaStore.getState().setStatus("listening");
      }
      devLog("wake", "Follow-up window closed.");
    }, FOLLOW_UP_WINDOW_MS);
    this.cues.playFollowUp();
    devLog("wake", "Follow-up window open.");
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

  private abortActiveFetch() {
    if (!this.activeFetchAbort) return;
    this.activeFetchAbort.abort();
    this.activeFetchAbort = null;
  }

  private stopPlayback() {
    this.isAssistantSpeaking = false;
    this.suppressSttUntilMs = Date.now() + PLAYBACK_STT_COOLDOWN_MS;
    this.clearFollowUpStartTimer();
    // Invalidate any in-flight clip callbacks and stop the active buffer source.
    this.playbackGeneration++;
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
      await appendSessionTurn(this.sessionId, {
        role: "speaker",
        text,
        speaker: u.speaker >= 0 ? u.speaker : null,
        speakerName: u.speakerName ?? null,
        sourceUtteranceIds: turn.sourceUtteranceIds,
      });
      this.onSessionActivity?.();
    } catch (err) {
      for (const id of turn.sourceUtteranceIds) {
        this.persistedUtteranceIds.delete(id);
      }
      const msg = err instanceof Error ? err.message : "unknown error";
      devLog("session", `Failed to persist speaker turn: ${msg}`);
    }
  }
}
