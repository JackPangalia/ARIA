"use client";

// Holds a rolling window of recent 16 kHz mono PCM audio so we can slice the
// audio for any finalized utterance after the fact (using the same timeline
// Deepgram reports — start/end seconds relative to stream open).

const SAMPLE_RATE = 16_000;

export class PcmRingBuffer {
  private readonly capacity: number;
  private readonly buffer: Float32Array;
  private writeOffset = 0;
  private totalSamplesWritten = 0;

  constructor(durationSec = 90) {
    this.capacity = SAMPLE_RATE * durationSec;
    this.buffer = new Float32Array(this.capacity);
  }

  // Accepts Int16 PCM (matching what we already send to Deepgram) and stores
  // it as normalized Float32 in [-1, 1].
  pushInt16(pcm: Int16Array): void {
    for (let i = 0; i < pcm.length; i++) {
      this.buffer[this.writeOffset] = pcm[i]! / 0x8000;
      this.writeOffset = (this.writeOffset + 1) % this.capacity;
    }
    this.totalSamplesWritten += pcm.length;
  }

  get currentTimeSec(): number {
    return this.totalSamplesWritten / SAMPLE_RATE;
  }

  // Extracts a [startSec, endSec] slice. Returns null if the requested window
  // is no longer in the ring (overran) or has zero/negative duration.
  getSlice(startSec: number, endSec: number): Float32Array | null {
    if (endSec <= startSec) return null;
    const startSample = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
    const endSample = Math.min(
      this.totalSamplesWritten,
      Math.ceil(endSec * SAMPLE_RATE)
    );
    if (endSample <= startSample) return null;

    const length = endSample - startSample;
    if (length > this.capacity) return null;

    // The oldest sample currently in the buffer.
    const oldestAvailable = Math.max(
      0,
      this.totalSamplesWritten - this.capacity
    );
    if (startSample < oldestAvailable) return null;

    const out = new Float32Array(length);
    // Where in the ring does `startSample` live?
    const offsetFromWrite =
      this.totalSamplesWritten - startSample; // samples behind the write head
    let readPos =
      (this.writeOffset - offsetFromWrite + this.capacity) % this.capacity;

    for (let i = 0; i < length; i++) {
      out[i] = this.buffer[readPos]!;
      readPos = (readPos + 1) % this.capacity;
    }
    return out;
  }
}

export const PCM_SAMPLE_RATE = SAMPLE_RATE;
