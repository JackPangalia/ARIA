"use client";

import { DeepgramLiveClient } from "./deepgram-client";
import { MicPcmStreamer } from "./mic-pcm-streamer";
import { devLog } from "@/lib/client/dev-log";
import { useAriaStore, speakerLabel, transcriptToText } from "@/lib/store";
import type { TranscriptUtterance } from "@/lib/types";

const WAKE_PATTERNS = [
  /\b(?:hey|hi|okay|ok)\s*,?\s*(?:aria|arya|area)\b[\s,.:;!?-]*/i,
  /^\s*(?:aria|arya)\b[\s,.:;!?-]*/i,
];

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

export class AriaEngine {
  private dg: DeepgramLiveClient | null = null;
  private mic: MicPcmStreamer | null = null;
  private capturingQuestion = false;
  private questionUtterances: TranscriptUtterance[] = [];
  private wakeUtteranceId: string | null = null;
  private inlineQuestion = "";
  private currentAudio: HTMLAudioElement | null = null;

  async start() {
    const store = useAriaStore.getState();
    store.setError(null);
    store.setStatus("listening");

    devLog("session", "Mic session started — transcript lines print here in dev.");
    try {
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
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
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
    this.stopPlayback();
    useAriaStore.getState().setMicLevel(0);
    useAriaStore.getState().setStatus("idle");
  }

  private handleUtterance(u: TranscriptUtterance) {
    useAriaStore.getState().upsertUtterance(u);
    if (u.isFinal) {
      const names = useAriaStore.getState().speakerNames;
      devLog(
        "utterance",
        `${speakerLabel(u.speaker, names)}: ${u.text}`,
        { speaker: u.speaker }
      );
    }
    const wake = extractQuestionAfterWake(u.text);

    if (!this.capturingQuestion && wake.detected) {
      this.handleWake(u.id);
    }

    if (!this.capturingQuestion) return;

    if (this.wakeUtteranceId === u.id) {
      if (wake.detected) this.inlineQuestion = wake.question;
      if (u.isFinal && this.inlineQuestion) {
        void this.askAndReset(this.inlineQuestion);
      }
      return;
    }

    if (u.isFinal) {
      this.questionUtterances.push({
        ...u,
        text: wake.detected ? wake.question : u.text,
      });
    }
  }

  private handleUtteranceEnd() {
    if (!this.capturingQuestion) return;

    const question = this.questionUtterances
      .map((u) => u.text)
      .join(" ")
      .trim();

    if (question.length > 0) {
      void this.askAndReset(question);
      return;
    }

    if (this.inlineQuestion.length > 0) {
      void this.askAndReset(this.inlineQuestion);
      return;
    }

    // If the user only said "Hey ARIA", keep the capture window open for the
    // next utterance instead of immediately falling back to passive listening.
    this.wakeUtteranceId = null;
    useAriaStore.getState().setStatus("capturing-question");
  }

  private handleWake(utteranceId: string) {
    const store = useAriaStore.getState();
    if (
      store.status === "thinking" ||
      store.status === "speaking" ||
      store.status === "capturing-question"
    ) {
      // Barge-in: stop ARIA and start capturing a fresh question.
      this.stopPlayback();
    }
    this.questionUtterances = [];
    this.inlineQuestion = "";
    this.wakeUtteranceId = utteranceId;
    this.capturingQuestion = true;
    store.setStatus("capturing-question");
    devLog("wake", "Wake phrase detected — say your question (or continue).");
  }

  private async askAndReset(question: string) {
    this.resetQuestionCapture();
    await this.askAria(question);
  }

  private resetQuestionCapture() {
    this.capturingQuestion = false;
    this.questionUtterances = [];
    this.wakeUtteranceId = null;
    this.inlineQuestion = "";
  }

  private async askAria(question: string) {
    const store = useAriaStore.getState();
    store.setStatus("thinking");

    const transcript = transcriptToText(
      store.utterances,
      store.speakerNames
    );

    devLog("ask", "Question for ARIA", {
      question,
      transcript: transcript.trim() || "(no prior final lines yet)",
    });

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, question }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Ask failed: ${res.status} ${errText}`);
      }

      // Buffer the streamed mp3 into a single Blob for playback. Simpler than
      // MediaSource and good enough for MVP — Flash v2.5 returns audio quickly.
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      this.currentAudio = audio;
      audio.onplay = () => useAriaStore.getState().setStatus("speaking");
      audio.onended = () => {
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        useAriaStore.getState().setStatus("listening");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        useAriaStore.getState().setError("Audio playback error");
      };
      await audio.play();
      devLog("tts", "Playing spoken answer in browser.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      devLog("error", msg);
      useAriaStore.getState().setError(msg);
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
  }
}
