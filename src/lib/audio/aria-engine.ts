"use client";

import { CueEngine } from "./cue-engine";
import { DeepgramLiveClient } from "./deepgram-client";
import { MicPcmStreamer } from "./mic-pcm-streamer";
import { PCM_SAMPLE_RATE, PcmRingBuffer } from "./pcm-ring-buffer";
import { SpeakerEmbeddingClient } from "./speaker-embedding-client";
import { SpeakerIdentifier } from "./speaker-identifier";
import {
  formatNameList,
  namesMatch,
  parseSpeakerNamingCommand,
  resolveSelfIntroduction,
} from "./speaker-naming";
import { devLog } from "@/lib/client/dev-log";
import {
  displayLabelForUtterance,
  useAriaStore,
  transcriptToText,
} from "@/lib/store";
import {
  deleteVoiceprint,
  loadVoiceprints,
  saveVoiceprint,
} from "@/lib/firebase/voiceprints";
import type { IntroductionMode, TranscriptUtterance } from "@/lib/types";

const WAKE_PATTERNS = [
  /\b(?:hey|hi|okay|ok)\s*,?\s*(?:aria|arya|area)\b[\s,.:;!?-]*/i,
  /^\s*(?:aria|arya|area)\b[\s,.:;!?-]*/i,
];

const QUESTION_SETTLE_MS = 1400;
const SPEECH_FINAL_SETTLE_MS = 700;
const FOLLOW_UP_WINDOW_MS = 5000;
const SOLO_INTRO_WINDOW_MS = 30_000;
const GROUP_INTRO_WINDOW_MS = 90_000;

// Speaker-embedding gating thresholds.
const MIN_EMBED_DURATION_SEC = 1.0;
const MAX_EMBED_DURATION_SEC = 12.0;
const MIN_EMBED_RMS = 0.005;
const PENDING_ENROLL_TTL_MS = 60_000;
const VOICEPRINT_SAMPLE_CAP = 30;
const VOICEPRINT_SAVE_DEBOUNCE_MS = 1500;
// If a saved name is already mapped to another Deepgram speaker in this
// session, require much stronger evidence before treating a new speaker id as
// the same person. This keeps new people as Speaker 2/3 until they introduce
// themselves, while still allowing true Deepgram renumbering to recover.
const DUPLICATE_NAME_ALIAS_SIMILARITY = 0.88;

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

function pcmLevel(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i] / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / pcm.length);
}

function floatRms(pcm: Float32Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i]! * pcm[i]!;
  return Math.sqrt(sum / pcm.length);
}

export class AriaEngine {
  private dg: DeepgramLiveClient | null = null;
  private mic: MicPcmStreamer | null = null;
  private capturingQuestion = false;
  private questionUtterances: TranscriptUtterance[] = [];
  private wakeUtteranceId: string | null = null;
  private wakeSpeaker: number | null = null;
  private inlineQuestion = "";
  private introMode: IntroductionMode = "off";
  private introModeTimeout: ReturnType<typeof setTimeout> | null = null;
  private questionSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private followUpTimer: ReturnType<typeof setTimeout> | null = null;
  private followUpListening = false;
  private captureWholeAnchorUtterance = false;
  private activeFetchAbort: AbortController | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  private cues = new CueEngine();

  // Speaker fingerprinting state.
  private ring = new PcmRingBuffer(90);
  private embedder = new SpeakerEmbeddingClient();
  private identifier = new SpeakerIdentifier();
  private embedderReady = false;
  private userUid: string | null = null;
  private utteranceEmbeddings = new Map<string, Float32Array>();
  private pendingEnroll = new Map<
    string,
    { name: string; expiresAt: number }
  >();
  private saveDebounce = new Map<string, ReturnType<typeof setTimeout>>();
  private inflightEmbeddings = new Map<string, Promise<void>>();

  async start({ uid }: { uid: string | null } = { uid: null }) {
    const store = useAriaStore.getState();
    store.setError(null);
    store.setStatus("listening");
    this.userUid = uid;
    this.ring = new PcmRingBuffer(90);
    this.identifier = new SpeakerIdentifier();
    this.utteranceEmbeddings.clear();
    this.pendingEnroll.clear();

    devLog("session", "Mic session started — transcript lines print here in dev.");

    // Load existing voiceprints from Firestore (non-blocking).
    if (uid) {
      void (async () => {
        try {
          const prints = await loadVoiceprints(uid);
          this.identifier.load(prints);
          useAriaStore.getState().setVoiceprints(this.identifier.list());
          if (prints.length > 0) {
            devLog("speakers", `Loaded ${prints.length} stored voiceprint(s).`);
          }
        } catch (err) {
          devLog(
            "speakers",
            `Failed to load voiceprints: ${err instanceof Error ? err.message : err}`
          );
        }
      })();
    } else {
      useAriaStore.getState().setVoiceprints([]);
    }

    // Warm up the embedding worker in parallel (non-blocking).
    void (async () => {
      try {
        await this.embedder.ensureReady();
        this.embedderReady = true;
        devLog("speakers", "Speaker embedding model ready.");
      } catch (err) {
        this.embedderReady = false;
        devLog(
          "speakers",
          `Speaker embedding disabled (model load failed): ${
            err instanceof Error ? err.message : err
          }`
        );
      }
    })();

    try {
      await this.cues.ensureReady();
      this.dg = new DeepgramLiveClient({
        onOpen: () => {
          /* noop */
        },
        onClose: () => {
          /* noop */
        },
        onError: (err) => {
          devLog("deepgram", err.message);
          useAriaStore.getState().setError(err.message);
        },
        onUtterance: (u) => this.handleUtterance(u),
        onUtteranceEnd: () => this.handleUtteranceEnd(),
      });

      await this.dg.connect();
      this.mic = new MicPcmStreamer();
      await this.mic.start((frame) => {
        useAriaStore.getState().setMicLevel(pcmLevel(frame));
        this.dg?.sendPcm(frame);
        this.ring.pushInt16(frame);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      this.cues.playError();
      useAriaStore.getState().setError(msg);
      await this.stop();
    }
  }

  async stop() {
    await this.mic?.stop();
    this.mic = null;
    if (this.dg) {
      this.dg.close();
      this.dg = null;
    }
    this.resetQuestionCapture();
    this.stopIntroMode();
    this.stopFollowUpWindow();
    this.abortActiveFetch();
    this.stopPlayback();
    this.cues.stopThinkingLoop();
    void this.cues.dispose();
    this.embedder.dispose();
    this.embedderReady = false;
    this.utteranceEmbeddings.clear();
    this.pendingEnroll.clear();
    this.inflightEmbeddings.clear();
    for (const t of this.saveDebounce.values()) clearTimeout(t);
    this.saveDebounce.clear();
    useAriaStore.getState().setMicLevel(0);
    useAriaStore.getState().setStatus("idle");
  }

  private handleUtterance(u: TranscriptUtterance) {
    useAriaStore.getState().upsertUtterance(u);
    if (u.isFinal) {
      this.maybeAssignSpeakerFromIntroduction(u);
      void this.processSpeakerEmbedding(u);
      const names = useAriaStore.getState().speakerNames;
      devLog(
        "utterance",
        `${displayLabelForUtterance(u, names)}: ${u.text}`,
        { speaker: u.speaker }
      );
    }
    const wake = extractQuestionAfterWake(u.text);

    if (!this.capturingQuestion) {
      if (wake.detected) {
        this.handleWake(u.id, u.speaker);
      } else if (this.followUpListening && u.text.trim().length > 0) {
        this.handleFollowUp(u.id, u.speaker);
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
    if (!this.capturingQuestion) return;

    if (this.getCapturedQuestion().question.length > 0) {
      this.ensureQuestionResolutionTimer(QUESTION_SETTLE_MS);
      return;
    }

    // If the user only said "Hey ARIA", keep the capture window open for the
    // next utterance instead of immediately falling back to passive listening.
    this.wakeUtteranceId = null;
    this.wakeSpeaker = null;
    useAriaStore.getState().setStatus("capturing-question");
  }

  private handleWake(utteranceId: string, speaker: number) {
    const store = useAriaStore.getState();
    if (
      store.status === "thinking" ||
      store.status === "speaking" ||
      store.status === "capturing-question"
    ) {
      // Barge-in: stop ARIA and start capturing a fresh question.
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
    this.captureWholeAnchorUtterance = false;
    this.capturingQuestion = true;
    this.cues.playWake();
    store.setStatus("capturing-question");
    devLog("wake", "Wake phrase detected — say your question (or continue).");
  }

  private handleFollowUp(utteranceId: string, speaker: number) {
    const store = useAriaStore.getState();
    this.stopFollowUpWindow();
    this.clearQuestionSettleTimer();
    this.questionUtterances = [];
    this.inlineQuestion = "";
    this.wakeUtteranceId = utteranceId;
    this.wakeSpeaker = speaker;
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

  private getCapturedQuestion(): { question: string; speaker: number | null } {
    const parts = [
      this.inlineQuestion.trim(),
      ...this.questionUtterances.map((u) => u.text.trim()),
    ].filter(Boolean);

    return {
      question: parts.join(" ").trim(),
      speaker: this.wakeSpeaker ?? this.questionUtterances[0]?.speaker ?? null,
    };
  }

  private scheduleQuestionResolution(delayMs: number) {
    this.clearQuestionSettleTimer();
    this.questionSettleTimer = setTimeout(() => {
      this.questionSettleTimer = null;
      const { question, speaker } = this.getCapturedQuestion();
      if (!question) return;
      void this.resolveCapturedQuestion(question, speaker);
    }, delayMs);
  }

  private ensureQuestionResolutionTimer(delayMs: number) {
    if (this.questionSettleTimer) return;
    this.scheduleQuestionResolution(delayMs);
  }

  private clearQuestionSettleTimer() {
    if (!this.questionSettleTimer) return;
    clearTimeout(this.questionSettleTimer);
    this.questionSettleTimer = null;
  }

  private async resolveCapturedQuestion(
    question: string,
    speaker: number | null
  ) {
    const prompt = this.applyNamingCommand(question, speaker);
    if (prompt) {
      this.resetQuestionCapture();
      await this.speakPrompt(prompt);
      return;
    }

    await this.askAndReset(question);
  }

  private async askAndReset(question: string) {
    this.resetQuestionCapture();
    await this.askAria(question);
  }

  private resetQuestionCapture() {
    this.clearQuestionSettleTimer();
    this.capturingQuestion = false;
    this.questionUtterances = [];
    this.wakeUtteranceId = null;
    this.wakeSpeaker = null;
    this.inlineQuestion = "";
    this.captureWholeAnchorUtterance = false;
  }

  private applyNamingCommand(
    text: string,
    speaker: number | null
  ): string | null {
    const store = useAriaStore.getState();
    const command = parseSpeakerNamingCommand(text, store.expectedParticipants);
    if (!command) return null;

    if (command.type === "roster") {
      store.setExpectedParticipants(command.names);
      this.startIntroMode("group", GROUP_INTRO_WINDOW_MS);
      devLog("speakers", "Expected participants updated.", {
        participants: command.names,
      });
      return `Got it. I'll listen for ${formatNameList(
        command.names
      )}. You can introduce yourselves one at a time.`;
    }

    if (command.type === "intro-done") {
      const wasActive = this.introMode !== "off";
      this.stopIntroMode();
      return wasActive
        ? "Got it. I'll stop listening for introductions."
        : "Introduction mode is already off.";
    }

    if (command.type === "intro-mode") {
      const timeout =
        command.mode === "solo" ? SOLO_INTRO_WINDOW_MS : GROUP_INTRO_WINDOW_MS;
      this.startIntroMode(command.mode, timeout);
      const names = store.expectedParticipants;
      if (command.mode === "solo") {
        return "Of course. Go ahead and say your name.";
      }
      if (names.length > 0) {
        return `Great. I'm listening for ${formatNameList(
          names
        )}. Please introduce yourselves one at a time.`;
      }
      return "Great. One at a time, say your name.";
    }

    if (speaker === null) {
      return "I heard the name, but I could not tell which speaker said it yet.";
    }

    const result = this.assignSpeakerName(
      speaker,
      command.match.name,
      "wake-command"
    );
    if (result === "assigned" || result === "same") {
      this.queueEnrollmentForRecentSpeaker(speaker, command.match.name);
    }
    if (
      this.introMode === "solo" &&
      (result === "assigned" || result === "same")
    ) {
      this.stopIntroMode();
    }
    if (result === "assigned" || result === "same") {
      return `Got it, ${command.match.name}.`;
    }

    return `I already have ${command.match.name} assigned to another voice, so I won't change that yet.`;
  }

  private maybeAssignSpeakerFromIntroduction(u: TranscriptUtterance) {
    if (this.introMode === "off") return;

    const store = useAriaStore.getState();
    const match = resolveSelfIntroduction(u.text, store.expectedParticipants, {
      allowUnlisted: true,
      allowCasualUnlisted: true,
    });
    if (!match) return;

    const result = this.assignSpeakerName(
      u.speaker,
      match.name,
      `${this.introMode}-intro-mode`
    );
    if (result === "assigned" || result === "same") {
      this.queueEnrollmentForUtterance(u.id, match.name);
    }
    if (this.introMode === "solo" && (result === "assigned" || result === "same")) {
      this.stopIntroMode();
    }
  }

  private startIntroMode(mode: Exclude<IntroductionMode, "off">, timeoutMs: number) {
    this.introMode = mode;
    useAriaStore.getState().setIntroductionMode(mode);
    if (this.introModeTimeout) {
      clearTimeout(this.introModeTimeout);
      this.introModeTimeout = null;
    }

    this.introModeTimeout = setTimeout(() => {
      this.introMode = "off";
      this.introModeTimeout = null;
      useAriaStore.getState().setIntroductionMode("off");
      devLog("speakers", `${mode} intro mode timed out.`);
    }, timeoutMs);
  }

  private stopIntroMode() {
    this.introMode = "off";
    useAriaStore.getState().setIntroductionMode("off");
    if (this.introModeTimeout) {
      clearTimeout(this.introModeTimeout);
      this.introModeTimeout = null;
    }
  }

  private assignSpeakerName(
    speaker: number,
    name: string,
    reason: string
  ): "assigned" | "same" | "conflict" {
    const store = useAriaStore.getState();
    const currentName = store.speakerNames[speaker];

    if (currentName && namesMatch(currentName, name)) {
      return "same";
    }

    if (currentName) {
      devLog("speakers", "Skipped conflicting speaker rename.", {
        speaker,
        currentName,
        requestedName: name,
        reason,
      });
      return "conflict";
    }

    const existingSpeaker = Object.entries(store.speakerNames).find(
      ([id, assignedName]) =>
        Number(id) !== speaker && namesMatch(assignedName, name)
    );
    if (existingSpeaker) {
      devLog("speakers", "Skipped duplicate speaker name assignment.", {
        speaker,
        existingSpeaker: Number(existingSpeaker[0]),
        requestedName: name,
        reason,
      });
      return "conflict";
    }

    store.assignSpeakerName(speaker, name);
    devLog("speakers", `Mapped Speaker ${speaker + 1} to ${name}.`, {
      speaker,
      name,
      reason,
    });
    this.maybeCompleteIntroMode();
    return "assigned";
  }

  private maybeCompleteIntroMode() {
    if (this.introMode !== "group") return;

    const store = useAriaStore.getState();
    if (store.expectedParticipants.length === 0) return;

    const assignedNames = Object.values(store.speakerNames);
    const allExpectedAssigned = store.expectedParticipants.every((name) =>
      assignedNames.some((assignedName) => namesMatch(assignedName, name))
    );

    if (allExpectedAssigned) {
      this.stopIntroMode();
      devLog("speakers", "All expected participants have been mapped.");
    }
  }

  private async askAria(question: string) {
    const store = useAriaStore.getState();
    store.setStatus("thinking");
    this.cues.startThinkingLoop();

    const transcript = transcriptToText(
      store.utterances,
      store.speakerNames
    );

    devLog("ask", "Question for ARIA", {
      question,
      transcript: transcript.trim() || "(no prior final lines yet)",
    });

    const controller = new AbortController();
    this.activeFetchAbort = controller;

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, question }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Ask failed: ${res.status} ${errText}`);
      }

      await this.playAudioResponse(res, "Playing spoken answer in browser.", {
        enableFollowUp: true,
      });
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

  private async speakPrompt(text: string) {
    const prompt = text.trim();
    if (!prompt) return;

    useAriaStore.getState().setStatus("thinking");
    devLog("speakers", "ARIA setup prompt", { prompt });

    const controller = new AbortController();
    this.activeFetchAbort = controller;

    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: prompt }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Speak failed: ${res.status} ${errText}`);
      }

      await this.playAudioResponse(res, "Playing spoken setup prompt.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        devLog("tts", "Speak request aborted.");
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
    options: { enableFollowUp?: boolean } = {}
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
    const blob = new Blob([buf], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    this.attachPlayback(url, () => URL.revokeObjectURL(url), logMessage, options);
  }

  private async playStreamingResponse(
    body: ReadableStream<Uint8Array>,
    logMessage: string,
    options: { enableFollowUp?: boolean }
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
    options: { enableFollowUp?: boolean }
  ) {
    this.stopPlayback();
    const audio = new Audio(url);
    this.currentAudio = audio;
    this.currentAudioUrl = url;
    audio.onplay = () => {
      this.cues.stopThinkingLoop();
      useAriaStore.getState().setStatus("speaking");
    };
    audio.onended = () => {
      if (this.currentAudio !== audio) return;
      revoke();
      this.currentAudio = null;
      this.currentAudioUrl = null;
      useAriaStore.getState().setStatus("listening");
      if (options.enableFollowUp) {
        this.startFollowUpWindow();
      }
    };
    audio.onerror = () => {
      if (this.currentAudio !== audio) return;
      revoke();
      this.currentAudio = null;
      this.currentAudioUrl = null;
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

  private stopFollowUpWindow() {
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

  // === Speaker embedding pipeline ===

  private async processSpeakerEmbedding(u: TranscriptUtterance) {
    if (!u.isFinal) return;
    if (this.inflightEmbeddings.has(u.id)) return;
    if (!this.embedderReady) {
      // Embedding worker not ready yet; identifier hint isn't available, but
      // we still wire downstream so naming works once the model loads.
      return;
    }

    const duration = u.end - u.start;
    if (duration < MIN_EMBED_DURATION_SEC) return;

    const sliceStart = u.start;
    const sliceEnd = Math.min(
      u.end,
      u.start + MAX_EMBED_DURATION_SEC
    );

    const task = (async () => {
      // Small delay to let the tail of audio arrive in the ring buffer.
      const targetTime = sliceEnd + 0.15;
      const waitMs = Math.max(
        0,
        Math.round((targetTime - this.ring.currentTimeSec) * 1000)
      );
      if (waitMs > 0 && waitMs < 1500) {
        await new Promise((r) => setTimeout(r, waitMs));
      }

      const pcm = this.ring.getSlice(sliceStart, sliceEnd);
      if (!pcm) {
        devLog("speakers", "Audio slice unavailable for embedding.", {
          uid: u.id,
        });
        return;
      }
      if (pcm.length < PCM_SAMPLE_RATE * MIN_EMBED_DURATION_SEC) return;
      if (floatRms(pcm) < MIN_EMBED_RMS) {
        devLog("speakers", "Skipping low-energy segment.", { uid: u.id });
        return;
      }

      let embedding: Float32Array;
      try {
        embedding = await this.embedder.embed(pcm);
      } catch (err) {
        devLog(
          "speakers",
          `Embedding failed: ${err instanceof Error ? err.message : err}`
        );
        return;
      }

      this.utteranceEmbeddings.set(u.id, embedding);
      this.trimEmbeddingCache();

      // Check pending enrollment for this utterance (intro/wake flow set it).
      this.flushPendingEnrollment(u.id);

      // Run identification.
      const match = this.identifier.identify(embedding);
      const acceptedName = this.acceptVoiceprintMatchForSpeaker(
        u.speaker,
        match.name,
        match.confidence,
        match.similarity
      );
      useAriaStore.getState().patchUtterance(u.id, {
        assignedName: acceptedName,
        nameConfidence: match.confidence,
      });
      if (match.name) {
        if (acceptedName && match.confidence === "high") {
          this.aliasDeepgramSpeakerFromVoiceprint(
            u.speaker,
            acceptedName,
            u.id,
            match.similarity
          );
        }
        devLog("speakers", `Voice match: ${match.name}`, {
          uid: u.id,
          similarity: Number(match.similarity.toFixed(3)),
          runnerUp: Number(match.runnerUp.toFixed(3)),
          confidence: match.confidence,
          accepted: acceptedName === match.name,
        });
      }
    })().finally(() => {
      this.inflightEmbeddings.delete(u.id);
    });

    this.inflightEmbeddings.set(u.id, task);
  }

  private acceptVoiceprintMatchForSpeaker(
    speaker: number,
    name: string | null,
    confidence: string,
    similarity: number
  ): string | null {
    if (!name || confidence !== "high") return null;

    const store = useAriaStore.getState();
    const currentName = store.speakerNames[speaker];
    if (currentName) return namesMatch(currentName, name) ? name : null;

    const sameNameSpeaker = Object.entries(store.speakerNames).find(
      ([id, assignedName]) =>
        Number(id) !== speaker && namesMatch(assignedName, name)
    );
    if (!sameNameSpeaker) return name;

    if (similarity >= DUPLICATE_NAME_ALIAS_SIMILARITY) {
      return name;
    }

    devLog("speakers", "Rejected likely different speaker for saved voice.", {
      speaker,
      matchedName: name,
      existingSpeaker: Number(sameNameSpeaker[0]),
      similarity: Number(similarity.toFixed(3)),
      required: DUPLICATE_NAME_ALIAS_SIMILARITY,
    });
    return null;
  }

  private aliasDeepgramSpeakerFromVoiceprint(
    speaker: number,
    name: string,
    utteranceId: string,
    similarity: number
  ) {
    const store = useAriaStore.getState();
    const currentName = store.speakerNames[speaker];
    if (currentName && namesMatch(currentName, name)) return;

    if (currentName && !namesMatch(currentName, name)) {
      devLog("speakers", "Skipped voiceprint alias conflict.", {
        speaker,
        currentName,
        matchedName: name,
        utteranceId,
      });
      return;
    }

    const sameNameSpeaker = Object.entries(store.speakerNames).find(
      ([id, assignedName]) =>
        Number(id) !== speaker && namesMatch(assignedName, name)
    );
    if (sameNameSpeaker && similarity < DUPLICATE_NAME_ALIAS_SIMILARITY) {
      devLog("speakers", "Skipped duplicate voiceprint alias.", {
        speaker,
        existingSpeaker: Number(sameNameSpeaker[0]),
        matchedName: name,
        similarity: Number(similarity.toFixed(3)),
        required: DUPLICATE_NAME_ALIAS_SIMILARITY,
        utteranceId,
      });
      return;
    }

    store.assignSpeakerName(speaker, name);
    devLog("speakers", `Recognized Speaker ${speaker + 1} as ${name}.`, {
      speaker,
      name,
      utteranceId,
    });
  }

  private trimEmbeddingCache() {
    if (this.utteranceEmbeddings.size <= 200) return;
    const overflow = this.utteranceEmbeddings.size - 200;
    let i = 0;
    for (const key of this.utteranceEmbeddings.keys()) {
      if (i++ >= overflow) break;
      this.utteranceEmbeddings.delete(key);
    }
  }

  private queueEnrollmentForUtterance(utteranceId: string, name: string) {
    // Either the embedding has already arrived (enroll now) or it hasn't yet
    // (remember the intent so the embedding handler can enroll later).
    const cached = this.utteranceEmbeddings.get(utteranceId);
    if (cached) {
      this.enrollEmbedding(name, cached);
      return;
    }
    this.pendingEnroll.set(utteranceId, {
      name,
      expiresAt: Date.now() + PENDING_ENROLL_TTL_MS,
    });
    this.gcPendingEnroll();
  }

  private queueEnrollmentForRecentSpeaker(speaker: number, name: string) {
    // Find the most recent final utterance by this DG speaker number that has
    // an embedding ready.
    const utterances = useAriaStore.getState().utterances;
    for (let i = utterances.length - 1; i >= 0; i--) {
      const u = utterances[i]!;
      if (!u.isFinal) continue;
      if (u.speaker !== speaker) continue;
      const emb = this.utteranceEmbeddings.get(u.id);
      if (emb) {
        this.enrollEmbedding(name, emb);
        return;
      }
      this.pendingEnroll.set(u.id, {
        name,
        expiresAt: Date.now() + PENDING_ENROLL_TTL_MS,
      });
      this.gcPendingEnroll();
      return;
    }
  }

  private flushPendingEnrollment(utteranceId: string) {
    const pending = this.pendingEnroll.get(utteranceId);
    if (!pending) return;
    this.pendingEnroll.delete(utteranceId);
    const emb = this.utteranceEmbeddings.get(utteranceId);
    if (!emb) return;
    this.enrollEmbedding(pending.name, emb);
  }

  private gcPendingEnroll() {
    const now = Date.now();
    for (const [k, v] of this.pendingEnroll) {
      if (v.expiresAt < now) this.pendingEnroll.delete(k);
    }
  }

  private enrollEmbedding(name: string, embedding: Float32Array) {
    const existing = this.identifier
      .list()
      .find((v) => namesMatch(v.name, name));
    if (existing && existing.sampleCount >= VOICEPRINT_SAMPLE_CAP) {
      return;
    }
    this.identifier.enroll(name, embedding);
    useAriaStore.getState().setVoiceprints(this.identifier.list());
    devLog("speakers", `Enrolled voiceprint sample for ${name}.`);
    this.scheduleVoiceprintSave(name);
  }

  private scheduleVoiceprintSave(name: string) {
    if (!this.userUid) return;
    const uid = this.userUid;
    const prev = this.saveDebounce.get(name);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      this.saveDebounce.delete(name);
      const current = this.identifier.list().find((v) => v.name === name);
      if (!current) return;
      void saveVoiceprint(uid, current).catch((err) => {
        devLog(
          "speakers",
          `Voiceprint save failed for ${name}: ${err instanceof Error ? err.message : err}`
        );
      });
    }, VOICEPRINT_SAVE_DEBOUNCE_MS);
    this.saveDebounce.set(name, t);
  }

  // === Public voiceprint management (called by Settings UI) ===

  async removeVoiceprint(name: string): Promise<void> {
    this.identifier.remove(name);
    useAriaStore.getState().setVoiceprints(this.identifier.list());
    useAriaStore.getState().removeVoiceprintLocal(name);
    if (this.userUid) {
      await deleteVoiceprint(this.userUid, name);
    }
  }

  async clearAllVoiceprints(): Promise<void> {
    const names = this.identifier.list().map((v) => v.name);
    this.identifier.clear();
    useAriaStore.getState().setVoiceprints([]);
    if (this.userUid) {
      const uid = this.userUid;
      await Promise.all(names.map((n) => deleteVoiceprint(uid, n)));
    }
  }

  private stopPlayback() {
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
}
