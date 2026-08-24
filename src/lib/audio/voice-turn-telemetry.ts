"use client";

import { devLog } from "@/lib/client/dev-log";

export type VoiceTurnEvent =
  | "wake"
  | "speech_onset"
  | "speech_end"
  | "speech_final"
  | "end_of_utterance"
  | "endpoint_forced"
  | "endpoint_grace"
  | "settle_hold"
  | "continuation_reopen"
  | "speculation_start"
  | "speculation_adopted"
  | "speculation_discarded"
  | "dispatch"
  | "response_headers"
  | "first_audio_chunk"
  | "first_audible_sample"
  | "playback_underrun"
  | "aec_state"
  | "barge_in_suspected"
  | "barge_in_confirmed"
  | "interrupt_complete"
  | "stop_requested"
  | "stop_complete"
  | "completed"
  | "aborted"
  | "failed";

type VoiceTurnMark = {
  event: VoiceTurnEvent;
  atMs: number;
  sincePreviousMs: number;
  data?: Record<string, unknown>;
};

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export class VoiceTurnTelemetry {
  readonly turnId = crypto.randomUUID();
  private readonly startedAt = nowMs();
  private lastAt = this.startedAt;
  private marks: VoiceTurnMark[] = [];
  private ended = false;

  constructor(private readonly sessionId: string) {}

  mark(event: VoiceTurnEvent, data?: Record<string, unknown>): void {
    if (this.ended) return;
    const now = nowMs();
    const mark: VoiceTurnMark = {
      event,
      atMs: Math.round(now - this.startedAt),
      sincePreviousMs: Math.round(now - this.lastAt),
      ...(data ? { data } : {}),
    };
    this.lastAt = now;
    this.marks.push(mark);
    devLog("voice-turn", event, {
      turnId: this.turnId,
      sessionId: this.sessionId,
      ...mark,
    });
  }

  finish(
    outcome: Extract<VoiceTurnEvent, "completed" | "aborted" | "failed">,
    data?: Record<string, unknown>
  ): void {
    if (this.ended) return;
    this.mark(outcome, data);
    this.ended = true;
    devLog("voice-summary", outcome, {
      turnId: this.turnId,
      sessionId: this.sessionId,
      totalMs: Math.round(nowMs() - this.startedAt),
      marks: this.marks,
    });
  }
}

