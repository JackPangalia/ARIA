"use client";

import { SpeechActivityDetector } from "./speech-activity-detector";

// Acoustic barge-in detector.
//
// While Kivo is speaking, the mic keeps streaming. Echo cancellation removes
// Kivo's own voice (see mic-pcm-streamer), so what's left on the feed is the
// room — and, when the user starts talking over Kivo, their voice. This module
// watches the mic energy during playback and reports, in two stages, when the
// user is interrupting:
//
//   1. `onSuspected` — a short run of voiced energy. The engine *ducks* the
//      answer (drops its volume) so the user hears they've been heard, but the
//      answer isn't killed yet in case it's a cough/laugh/false alarm.
//   2. `onConfirmed` — sustained voiced energy. This is a real interruption:
//      the engine stops the answer and captures what the user is saying.
//
// If the energy falls away after a suspicion but before confirmation,
// `onEnded` fires and the engine un-ducks (restores the answer volume).
//
// The detector is time-based, not frame-count based, so it behaves the same
// regardless of the mic's buffer size. All thresholds live in one params
// object so they can be tuned live during manual testing.

export interface BargeInDetectorParams {
  /** PCM sample rate of the frames fed to `process` (Hz). */
  sampleRate: number;
  /** Voiced when frame RMS exceeds `floor * ratio` (and the absolute floor). */
  speechRmsRatio: number;
  /** Absolute RMS floor so ambient near-silence can't trigger via the ratio. */
  absoluteMinRms: number;
  /** Sustained voiced time before ducking (`onSuspected`). */
  duckMs: number;
  /** Sustained voiced time before a hard interrupt (`onConfirmed`). */
  confirmMs: number;
  /** Voiced run tolerates gaps shorter than this before it's considered over. */
  hangoverMs: number;
  /** Time at playback start spent measuring the residual-echo floor only. */
  primeMs: number;
  /** EMA weight for adapting the noise/echo floor during non-voiced frames. */
  floorEmaAlpha: number;
  /** Smoothed speech probability required for normal confirmation. */
  speechProbability: number;
}

// Defaults tuned for echo-cancelled 16 kHz mono speech. Adjust these while
// testing live: raise ratio/confirmMs if Kivo interrupts itself on residual
// echo; lower them if real interruptions feel sluggish.
export const DEFAULT_BARGE_IN_PARAMS: BargeInDetectorParams = {
  sampleRate: 16_000,
  speechRmsRatio: 3.0,
  absoluteMinRms: 0.015,
  duckMs: 140,
  confirmMs: 320,
  hangoverMs: 180,
  primeMs: 200,
  floorEmaAlpha: 0.05,
  // Room-tested 2026-08-22: 0.42 read ordinary room chatter (not just the
  // person Kivo is listening to) as "voiced" almost as readily as real speech
  // directed at Kivo, since this detector has no speaker/content gating — it's
  // pure energy + spectral shape. Raised so it takes clearer, more sustained
  // speech-like energy to start a duck/confirm run.
  speechProbability: 0.55,
};

export interface BargeInCallbacks {
  /** Short voiced run — duck the answer. */
  onSuspected?: (info: { onsetSecondsAgo: number }) => void;
  /** Sustained voiced run — hard interrupt. `onsetSecondsAgo` estimates how
   * long the user has been speaking, so the caller can rewind the echo window
   * to the start of the interruption. */
  onConfirmed?: (info: { onsetSecondsAgo: number }) => void;
  /** Voiced run ended after a suspicion but before confirmation — un-duck. */
  onEnded?: () => void;
}

type Phase = "idle" | "suspected" | "confirmed";

function rmsInt16(frame: Int16Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const v = frame[i] / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / frame.length);
}

export class BargeInDetector {
  private readonly params: BargeInDetectorParams;
  private readonly cb: BargeInCallbacks;

  private active = false;
  private phase: Phase = "idle";
  private floor = 0;
  private primedMs = 0;
  private voicedMs = 0;
  private silenceMs = 0;
  private readonly speechDetector: SpeechActivityDetector;

  constructor(cb: BargeInCallbacks, params: Partial<BargeInDetectorParams> = {}) {
    this.cb = cb;
    this.params = { ...DEFAULT_BARGE_IN_PARAMS, ...params };
    this.speechDetector = new SpeechActivityDetector({
      sampleRate: this.params.sampleRate,
      absoluteMinRms: this.params.absoluteMinRms,
      floorRatio: this.params.speechRmsRatio,
      floorAlpha: this.params.floorEmaAlpha,
    });
  }

  /** Begin watching for a barge-in (call when playback starts). */
  start(): void {
    this.active = true;
    this.phase = "idle";
    this.floor = 0;
    this.primedMs = 0;
    this.voicedMs = 0;
    this.silenceMs = 0;
    this.speechDetector.reset();
  }

  /** Stop watching (call when playback ends or after a confirmed interrupt). */
  stop(): void {
    this.active = false;
    this.phase = "idle";
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Feed one mic frame. No-op unless started. */
  process(frame: Int16Array): void {
    if (!this.active) return;

    const frameMs = (frame.length / this.params.sampleRate) * 1000;
    const rms = rmsInt16(frame);
    const activity = this.speechDetector.process(frame);

    // Prime the residual-echo/noise floor before detecting anything, so the
    // first moments of playback (where AEC is still converging) don't read as
    // a barge-in.
    if (this.primedMs < this.params.primeMs) {
      this.primedMs += frameMs;
      this.floor = this.floor === 0 ? rms : this.floor + (rms - this.floor) * 0.5;
      return;
    }

    const threshold = Math.max(
      this.floor * this.params.speechRmsRatio,
      this.params.absoluteMinRms
    );

    // Probability is the normal confirmation path. Very strong energy remains
    // a fallback for browsers whose AEC distorts speech spectral features, but
    // it's a blunt energy-only check — kept high so ordinary room noise can't
    // trip it on volume alone.
    const voiced =
      activity.probability >= this.params.speechProbability ||
      rms >= threshold * 2.6;

    if (voiced) {
      this.voicedMs += frameMs;
      this.silenceMs = 0;

      if (this.phase === "idle" && this.voicedMs >= this.params.duckMs) {
        this.phase = "suspected";
        this.cb.onSuspected?.({ onsetSecondsAgo: this.voicedMs / 1000 });
      }
      if (this.phase === "suspected" && this.voicedMs >= this.params.confirmMs) {
        this.phase = "confirmed";
        this.cb.onConfirmed?.({ onsetSecondsAgo: this.voicedMs / 1000 });
      }
      return;
    }

    // Non-voiced frame: adapt the floor toward ambient and, once the gap
    // exceeds the hangover, treat the run as over.
    this.floor = this.floor + (rms - this.floor) * this.params.floorEmaAlpha;
    this.silenceMs += frameMs;
    if (this.silenceMs >= this.params.hangoverMs) {
      if (this.phase === "suspected") {
        this.cb.onEnded?.();
      }
      this.phase = "idle";
      this.voicedMs = 0;
      this.silenceMs = 0;
    }
  }
}
