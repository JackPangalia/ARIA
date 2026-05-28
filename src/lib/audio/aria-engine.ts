"use client";

import { CueEngine } from "./cue-engine";
import { MicPcmStreamer } from "./mic-pcm-streamer";
import {
  SpeechmaticsLiveClient,
  type SpeechmaticsSpeakerResult,
} from "./speechmatics-client";
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
import { readStoredModel } from "@/lib/aria/model-storage";
import {
  listSpeakerProfiles,
  saveSpeakerProfile,
} from "@/lib/speakers/client";
import { sanitizeQuestionText } from "@/lib/aria/context/question-text";
import { joinText } from "@/lib/text/join-text";
import { messagesToText, useAriaStore } from "@/lib/store";
import type { TranscriptUtterance } from "@/lib/types";

const WAKE_PATTERNS = [
  /\b(?:hey|hi|okay|ok)\s*,?\s*(?:kivo|keevo|keyvo|quivo)\b[\s,.:;!?-]*/i,
  /^\s*(?:kivo|keevo|keyvo|quivo)\b[\s,.:;!?-]*/i,
];

const QUESTION_SETTLE_MS = 2800;
const SPEECH_FINAL_SETTLE_MS = 2800;
const FOLLOW_UP_WINDOW_MS = 8000;
const PLAYBACK_STT_COOLDOWN_MS = 800;
const TURN_IDLE_FLUSH_MS = 1800;
const CONTEXT_PREFETCH_DEBOUNCE_MS = 400;

function extractQuestionAfterWake(text: string): {
  detected: boolean;
  question: string;
} {
  for (const pattern of WAKE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    return {
      detected: true,
      question: text.slice(match.index + match[0].length).trim(),
    };
  }
  return { detected: false, question: "" };
}

function isSubstantiveQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  return /[a-zA-Z0-9]/.test(trimmed);
}

// Words that frequently follow "I'm" / "my name is" in casual speech and
// almost never start a real name. Used to reject false-positive enrollments
// like "I'm not too sure" → name "not too sure".
const ENROLLMENT_REJECT_LEADING = new Set([
  "a", "an", "the",
  "not", "no", "never",
  "going", "doing", "trying", "feeling", "looking", "wondering", "thinking",
  "sure", "okay", "ok", "fine", "good", "great", "bad", "tired", "ready",
  "really", "just", "still", "kind", "sort", "pretty", "very", "quite",
  "sorry", "afraid", "happy", "glad",
  "here", "there", "back",
  "from",
  "what", "where", "when", "why", "how", "can", "could", "would", "should",
  "telling", "saying", "asking",
]);

function extractSpeakerEnrollment(text: string): { name: string } | null {
  // Only accept deliberate enrollment phrases. "I'm" / "I am" / "this is" are
  // too ambiguous in conversation and are intentionally excluded.
  const pattern =
    /\b(?:my name is|call me|remember me as|please call me)\s+([A-Za-z][A-Za-z' -]{0,79})\b/i;
  const match = pattern.exec(text.trim());
  const rawName = match?.[1]
    ?.replace(/[.!?,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!rawName) return null;

  // Cap at 3 tokens — real spoken names rarely run longer.
  const tokens = rawName.split(" ").slice(0, 3);
  if (tokens.length === 0) return null;

  const first = tokens[0]!.toLowerCase();
  if (ENROLLMENT_REJECT_LEADING.has(first)) return null;
  if (first.length < 2) return null;

  return { name: tokens.join(" ") };
}

function pcmLevel(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i] / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / pcm.length);
}

export type AriaEngineOptions = {
  sessionId: string;
  onSessionActivity?: () => void;
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
  private cues = new CueEngine();
  private isAssistantSpeaking = false;
  private suppressSttUntilMs = 0;
  private turnAssembler = new TranscriptTurnAssembler();
  private turnFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingEnrollment:
    | {
        name: string;
        providerSpeakerLabel: string | null;
        resolve: (speaker: SpeechmaticsSpeakerResult) => void;
        reject: (err: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | null = null;

  constructor(options: AriaEngineOptions) {
    this.sessionId = options.sessionId;
    this.onSessionActivity = options.onSessionActivity;
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
      onSpeakersResult: (speakers) => this.handleSpeakersResult(speakers),
    }, profiles);

    await this.stt.connect();
  }

  async stop() {
    await this.mic?.stop();
    this.mic = null;
    if (this.stt) {
      this.stt.close();
      this.stt = null;
    }
    if (this.pendingEnrollment) {
      clearTimeout(this.pendingEnrollment.timer);
      this.pendingEnrollment.reject(new Error("Enrollment cancelled."));
      this.pendingEnrollment = null;
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
      this.ensureQuestionResolutionTimer(QUESTION_SETTLE_MS);
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

  private scheduleQuestionResolution(delayMs: number) {
    this.clearQuestionSettleTimer();
    this.scheduleContextPrefetch();
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

  private ensureQuestionResolutionTimer(delayMs: number) {
    if (this.questionSettleTimer) return;
    this.scheduleQuestionResolution(delayMs);
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
    const enrollment = extractSpeakerEnrollment(question);
    if (enrollment) {
      this.resetQuestionCapture();
      await this.rememberCurrentSpeaker(
        enrollment.name,
        captured.providerSpeakerLabel
      );
      return;
    }
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

  private handleSpeakersResult(speakers: SpeechmaticsSpeakerResult[]) {
    const pending = this.pendingEnrollment;
    if (!pending) return;

    const match = pending.providerSpeakerLabel
      ? speakers.find((speaker) => speaker.label === pending.providerSpeakerLabel)
      : speakers.length === 1
        ? speakers[0]
        : null;

    if (!match || match.speakerIdentifiers.length === 0) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingEnrollment = null;
    pending.resolve(match);
  }

  private waitForSpeakerIdentifiers(
    name: string,
    providerSpeakerLabel: string | null
  ): Promise<SpeechmaticsSpeakerResult> {
    if (!this.stt) {
      return Promise.reject(new Error("Speechmatics is not connected."));
    }
    if (this.pendingEnrollment) {
      return Promise.reject(new Error("A speaker enrollment is already pending."));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingEnrollment?.name === name) {
          this.pendingEnrollment = null;
        }
        reject(new Error("No speaker identifier was returned yet."));
      }, 6000);

      this.pendingEnrollment = {
        name,
        providerSpeakerLabel,
        resolve,
        reject,
        timer,
      };
      this.stt?.requestSpeakers({ final: false });
    });
  }

  private async rememberCurrentSpeaker(
    name: string,
    providerSpeakerLabel: string | null
  ) {
    const store = useAriaStore.getState();
    store.setStatus("thinking");
    try {
      const speaker = await this.waitForSpeakerIdentifiers(
        name,
        providerSpeakerLabel
      );
      await saveSpeakerProfile({
        name,
        speakerIdentifiers: speaker.speakerIdentifiers,
        sampleCount: 1,
      });
      this.onSessionActivity?.();
      this.cues.playFollowUp();
      devLog("speaker", `Saved speaker profile for ${name}.`);
      store.setStatus("listening");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "speaker enrollment failed";
      devLog("speaker", `Could not save speaker profile for ${name}: ${msg}`);
      this.cues.playError();
      store.setError(msg);
    }
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
        controller.signal,
        readStoredModel()
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
