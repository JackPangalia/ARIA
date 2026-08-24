"use client";

/**
 * Stateful linear PCM resampler.
 *
 * AudioWorklet delivers small, independent render quanta. Keeping the source
 * position and final sample between calls prevents a discontinuity at every
 * chunk boundary while producing one continuous target-rate stream.
 */
export class StreamingLinearResampler {
  private readonly ratio: number;
  private pending = new Float32Array(0);
  private sourcePosition = 0;

  constructor(
    readonly sourceSampleRate: number,
    readonly targetSampleRate: number
  ) {
    if (
      !Number.isFinite(sourceSampleRate) ||
      !Number.isFinite(targetSampleRate) ||
      sourceSampleRate <= 0 ||
      targetSampleRate <= 0
    ) {
      throw new Error("Sample rates must be positive finite numbers.");
    }
    if (sourceSampleRate < targetSampleRate) {
      throw new Error(
        `Unsupported input sample rate: ${sourceSampleRate}Hz`
      );
    }
    this.ratio = sourceSampleRate / targetSampleRate;
  }

  process(input: Float32Array): Float32Array {
    if (input.length === 0) return new Float32Array(0);
    if (this.sourceSampleRate === this.targetSampleRate) {
      return input.slice();
    }

    const samples = new Float32Array(this.pending.length + input.length);
    samples.set(this.pending);
    samples.set(input, this.pending.length);

    const output: number[] = [];
    while (this.sourcePosition < samples.length - 1) {
      const leftIndex = Math.floor(this.sourcePosition);
      const rightIndex = leftIndex + 1;
      const mix = this.sourcePosition - leftIndex;
      const left = samples[leftIndex]!;
      const right = samples[rightIndex]!;
      output.push(left + (right - left) * mix);
      this.sourcePosition += this.ratio;
    }

    // Keep at least the final sample so the next call can interpolate across
    // this chunk boundary. sourcePosition may have advanced past this chunk
    // when downsampling by an integer ratio; retaining the final sample also
    // preserves that offset into the next chunk.
    const consumed = Math.min(
      Math.floor(this.sourcePosition),
      Math.max(0, samples.length - 1)
    );
    this.pending = samples.slice(consumed);
    this.sourcePosition -= consumed;

    return Float32Array.from(output);
  }

  reset(): void {
    this.pending = new Float32Array(0);
    this.sourcePosition = 0;
  }
}
