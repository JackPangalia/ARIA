export const MAX_ENROLL_CLIPPED_SAMPLE_RATIO = 0.005;

const CLIPPING_SAMPLE_THRESHOLD = Math.round(0x7fff * 0.98);

export type EnrollmentQualityFailure = "clipping";

export interface EnrollmentQualityResult {
  failure: EnrollmentQualityFailure | null;
  clippedSampleRatio: number;
}

/**
 * Tracks only objective signal damage. Speechmatics is the authority on
 * whether a pass contains one usable voice; a local VAD threshold must never
 * reject clean enrollment audio because of room acoustics, AEC, or pauses.
 */
export class EnrollmentQualityTracker {
  private clippedSamples = 0;
  private totalSamples = 0;

  process(frame: Int16Array): void {
    if (frame.length === 0) return;
    for (const sample of frame) {
      if (Math.abs(sample) >= CLIPPING_SAMPLE_THRESHOLD) {
        this.clippedSamples += 1;
      }
    }
    this.totalSamples += frame.length;
  }

  result(): EnrollmentQualityResult {
    const clippedSampleRatio =
      this.totalSamples === 0 ? 0 : this.clippedSamples / this.totalSamples;
    const failure =
      clippedSampleRatio > MAX_ENROLL_CLIPPED_SAMPLE_RATIO
        ? "clipping"
        : null;

    return {
      failure,
      clippedSampleRatio,
    };
  }

  reset(): void {
    this.clippedSamples = 0;
    this.totalSamples = 0;
  }
}
