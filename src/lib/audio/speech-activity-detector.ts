"use client";

/**
 * The engine's local speech gate: a per-frame speech-vs-silence probability
 * consumed by `observeLocalSpeech`. Implemented by the lightweight RMS detector
 * below and by the Silero VAD detector (which falls back to RMS until its model
 * loads). Kept minimal so the two are interchangeable.
 */
export interface LocalSpeechDetector {
  process(frame: Int16Array): { probability: number };
  reset(): void;
}

export interface SpeechActivityDetectorOptions {
  sampleRate: number;
  absoluteMinRms: number;
  floorRatio: number;
  floorAlpha: number;
}

export interface SpeechActivityFrame {
  probability: number;
  rms: number;
  threshold: number;
  zeroCrossingRate: number;
}

const DEFAULTS: SpeechActivityDetectorOptions = {
  sampleRate: 16_000,
  absoluteMinRms: 0.009,
  floorRatio: 2.2,
  floorAlpha: 0.025,
};

/**
 * Lightweight browser speech detector for an existing PCM stream.
 *
 * RMS supplies the fast energy signal while zero-crossing rate rejects bumps,
 * clicks, and low-frequency room noise. The output is a smoothed probability,
 * consumed alongside Speechmatics rather than as a semantic turn detector.
 */
export class SpeechActivityDetector implements LocalSpeechDetector {
  private readonly options: SpeechActivityDetectorOptions;
  private floor = 0.003;
  private smoothedProbability = 0;

  constructor(options: Partial<SpeechActivityDetectorOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  reset(): void {
    this.floor = 0.003;
    this.smoothedProbability = 0;
  }

  process(frame: Int16Array): SpeechActivityFrame {
    if (frame.length === 0) {
      return {
        probability: 0,
        rms: 0,
        threshold: this.options.absoluteMinRms,
        zeroCrossingRate: 0,
      };
    }

    let sumSquares = 0;
    let crossings = 0;
    let previous = frame[0] ?? 0;
    for (let i = 0; i < frame.length; i++) {
      const current = frame[i]!;
      const sample = current / 32768;
      sumSquares += sample * sample;
      if (
        i > 0 &&
        ((current >= 0 && previous < 0) || (current < 0 && previous >= 0))
      ) {
        crossings += 1;
      }
      previous = current;
    }

    const rms = Math.sqrt(sumSquares / frame.length);
    const zeroCrossingRate = crossings / Math.max(1, frame.length - 1);
    const threshold = Math.max(
      this.options.absoluteMinRms,
      this.floor * this.options.floorRatio
    );
    const energyScore = Math.max(
      0,
      Math.min(1, (rms - threshold) / Math.max(threshold * 1.8, 0.012))
    );
    const speechBandScore =
      zeroCrossingRate < 0.008
        ? zeroCrossingRate / 0.008
        : zeroCrossingRate > 0.38
          ? Math.max(0, 1 - (zeroCrossingRate - 0.38) / 0.25)
          : 1;
    const rawProbability = energyScore * (0.35 + speechBandScore * 0.65);
    const smoothing = rawProbability > this.smoothedProbability ? 0.55 : 0.3;
    this.smoothedProbability +=
      (rawProbability - this.smoothedProbability) * smoothing;

    if (this.smoothedProbability < 0.28) {
      this.floor += (rms - this.floor) * this.options.floorAlpha;
      this.floor = Math.max(0.001, Math.min(this.floor, 0.08));
    }

    return {
      probability: this.smoothedProbability,
      rms,
      threshold,
      zeroCrossingRate,
    };
  }
}

