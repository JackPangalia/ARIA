const DEFAULT_NOISE_FLOOR = 0.003;
const MIN_SPEECH_RANGE = 0.018;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function lerp(current: number, target: number, amount: number): number {
  return current + (target - current) * amount;
}

/**
 * Converts raw mic RMS into a UI-only energy signal.
 *
 * Browser AGC/noise suppression can make Basic mode look much louder than the
 * raw capture used for speaker ID. This normalizer adapts to the current input
 * floor and speech peak so the orb feels consistent without touching STT audio.
 */
export class VisualMicLevelNormalizer {
  private noiseFloor = DEFAULT_NOISE_FLOOR;
  private speechRange = MIN_SPEECH_RANGE;
  private output = 0;

  update(rawLevel: number): number {
    const raw = clamp01(rawLevel);

    if (raw < this.noiseFloor * 1.8) {
      this.noiseFloor = lerp(this.noiseFloor, raw, 0.04);
    } else {
      this.noiseFloor = lerp(this.noiseFloor, raw, 0.001);
    }
    this.noiseFloor = Math.min(0.05, Math.max(0.0005, this.noiseFloor));

    const speechSignal = Math.max(0, raw - this.noiseFloor);
    const decayedRange = Math.max(MIN_SPEECH_RANGE, this.speechRange * 0.995);
    this.speechRange =
      speechSignal > decayedRange
        ? lerp(decayedRange, speechSignal, 0.22)
        : decayedRange;

    const gateOpen = raw > this.noiseFloor * 1.45 || speechSignal > 0.002;
    const normalized = gateOpen
      ? Math.pow(clamp01(speechSignal / this.speechRange), 0.65)
      : 0;

    this.output = lerp(
      this.output,
      normalized,
      normalized > this.output ? 0.42 : 0.1
    );
    return clamp01(this.output);
  }

  reset(): void {
    this.noiseFloor = DEFAULT_NOISE_FLOOR;
    this.speechRange = MIN_SPEECH_RANGE;
    this.output = 0;
  }
}

/**
 * Map Web Audio byte-time-domain samples (0–255, silence at 128) to a 0..1
 * playback envelope. Snappy enough for syllable pulse on the word ring.
 */
export function playbackRmsToLevel(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = (samples[i]! - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / samples.length);
  return clamp01(Math.pow(rms * 3.4, 0.62));
}
