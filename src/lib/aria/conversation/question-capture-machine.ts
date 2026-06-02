import { sanitizeQuestionText } from "@/lib/aria/context/question-text";
import { joinText } from "@/lib/text/join-text";
import type { TranscriptUtterance } from "@/lib/types";
import {
  extractQuestionAfterWake,
  extractQuestionAfterWakeMeeting,
  isSubstantiveQuestion,
  FOLLOW_UP_WINDOW_MS,
  QUESTION_SETTLE_MS,
  SPEECH_FINAL_SETTLE_MS,
} from "./wake";

export interface CapturedQuestion {
  question: string;
  speaker: number | null;
  speakerName: string | null;
  providerSpeakerLabel: string | null;
}

export type CaptureStatus =
  | "listening"
  | "capturing-question"
  | "follow-up-listening";

export interface QuestionCaptureCallbacks {
  /** Fired once a substantive question has settled. */
  onResolveQuestion: (captured: CapturedQuestion) => void;
  /** Status transitions, for surfacing UI/state if desired. */
  onStatus?: (status: CaptureStatus) => void;
}

export interface QuestionCaptureOptions {
  questionSettleMs?: number;
  speechFinalSettleMs?: number;
  followUpWindowMs?: number;
  /** Detect the wake word on interim transcripts (Recall partial_data). */
  wakeOnPartial?: boolean;
  /** Meeting bot: fuzzy "Kivo" matching for low-latency Recall ASR. */
  fuzzyWake?: boolean;
}

/**
 * Transport-agnostic port of AriaEngine's wake-word + question-capture state
 * machine. Feed it transcript utterances; it emits a settled question via
 * callbacks. It owns no audio I/O — callers handle speaking,
 * echo suppression, and barge-in around it (e.g. via `suspend()`/`resume()`).
 */
export class QuestionCaptureMachine {
  private readonly cb: QuestionCaptureCallbacks;
  private readonly questionSettleMs: number;
  private readonly speechFinalSettleMs: number;
  private readonly followUpWindowMs: number;
  private readonly wakeOnPartial: boolean;
  private readonly detectWake: (text: string) => ReturnType<
    typeof extractQuestionAfterWake
  >;

  private suspended = false;
  private capturingQuestion = false;
  private questionUtterances: TranscriptUtterance[] = [];
  private wakeUtteranceId: string | null = null;
  private wakeSpeaker: number | null = null;
  private wakeSpeakerName: string | null = null;
  private wakeProviderSpeakerLabel: string | null = null;
  private inlineQuestion = "";
  private captureWholeAnchorUtterance = false;

  private questionSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private followUpTimer: ReturnType<typeof setTimeout> | null = null;
  private followUpListening = false;

  constructor(cb: QuestionCaptureCallbacks, options: QuestionCaptureOptions = {}) {
    this.cb = cb;
    this.questionSettleMs = options.questionSettleMs ?? QUESTION_SETTLE_MS;
    this.speechFinalSettleMs = options.speechFinalSettleMs ?? SPEECH_FINAL_SETTLE_MS;
    this.followUpWindowMs = options.followUpWindowMs ?? FOLLOW_UP_WINDOW_MS;
    this.wakeOnPartial = options.wakeOnPartial ?? false;
    this.detectWake =
      options.fuzzyWake === true
        ? extractQuestionAfterWakeMeeting
        : extractQuestionAfterWake;
  }

  isCapturingQuestion(): boolean {
    return this.capturingQuestion;
  }

  getQuestionDraft(): string {
    return this.getCapturedQuestion().question;
  }

  /** Ignore incoming utterances (e.g. while the bot is speaking). */
  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
  }

  handleUtterance(u: TranscriptUtterance): void {
    if (this.suspended) return;

    const wake = this.detectWake(u.text);
    const utteranceStable =
      u.speechFinal ||
      u.isFinal ||
      (this.wakeOnPartial && wake.detected);

    if (!this.capturingQuestion && utteranceStable) {
      if (wake.detected) {
        this.handleWake(u, false);
      } else if (this.followUpListening && u.text.trim().length > 0) {
        this.handleWake(u, true);
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
          u.speechFinal ? this.speechFinalSettleMs : this.questionSettleMs
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
        u.speechFinal ? this.speechFinalSettleMs : this.questionSettleMs
      );
    }
  }

  /** Mirrors AriaEngine.handleUtteranceEnd's capture branch. */
  handleUtteranceEnd(): void {
    if (!this.capturingQuestion) return;
    if (this.getCapturedQuestion().question.length > 0) {
      if (!this.questionSettleTimer) {
        this.scheduleQuestionResolution(this.questionSettleMs);
      }
      return;
    }
    // "Hey Kivo" with nothing after: keep the capture window open.
    this.wakeUtteranceId = null;
    this.wakeSpeaker = null;
    this.cb.onStatus?.("capturing-question");
  }

  /** Open the no-wake-word follow-up window (call after the bot finishes speaking). */
  startFollowUpWindow(): void {
    this.stopFollowUpWindow();
    this.followUpListening = true;
    this.cb.onStatus?.("follow-up-listening");
    this.followUpTimer = setTimeout(() => {
      this.followUpListening = false;
      this.followUpTimer = null;
      this.cb.onStatus?.("listening");
    }, this.followUpWindowMs);
  }

  stopFollowUpWindow(): void {
    this.followUpListening = false;
    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer);
      this.followUpTimer = null;
    }
  }

  reset(): void {
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

  dispose(): void {
    this.reset();
    this.stopFollowUpWindow();
  }

  private handleWake(u: TranscriptUtterance, isFollowUp: boolean): void {
    this.stopFollowUpWindow();
    this.clearQuestionSettleTimer();
    this.questionUtterances = [];
    this.inlineQuestion = "";
    this.wakeUtteranceId = u.id;
    this.wakeSpeaker = u.speaker;
    this.wakeSpeakerName = u.speakerName ?? null;
    this.wakeProviderSpeakerLabel = u.providerSpeakerLabel ?? null;
    this.captureWholeAnchorUtterance = isFollowUp;
    this.capturingQuestion = true;
    this.cb.onStatus?.("capturing-question");
  }

  private upsertQuestionUtterance(u: TranscriptUtterance): void {
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

  private getCapturedQuestion(): CapturedQuestion {
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

  private scheduleQuestionResolution(delayMs: number): void {
    this.clearQuestionSettleTimer();
    this.questionSettleTimer = setTimeout(() => {
      this.questionSettleTimer = null;
      const captured = this.getCapturedQuestion();
      if (!captured.question) return;
      this.resolveCapturedQuestion(captured);
    }, delayMs);
  }

  private clearQuestionSettleTimer(): void {
    if (!this.questionSettleTimer) return;
    clearTimeout(this.questionSettleTimer);
    this.questionSettleTimer = null;
  }

  private resolveCapturedQuestion(captured: CapturedQuestion): void {
    if (!isSubstantiveQuestion(captured.question)) {
      this.reset();
      this.cb.onStatus?.("listening");
      return;
    }

    this.reset();
    this.cb.onResolveQuestion(captured);
  }
}
