import { describe, expect, it } from "vitest";
import { StreamingLinearResampler } from "./pcm-resample";

function concatenate(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

describe("StreamingLinearResampler", () => {
  it("returns an owned copy when the sample rate is already correct", () => {
    const input = new Float32Array([0, 0.25, -0.5, 1]);
    const output = new StreamingLinearResampler(16_000, 16_000).process(input);

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  it("preserves a 1 kHz tone across worklet-sized chunk boundaries", () => {
    const sourceRate = 48_000;
    const targetRate = 16_000;
    const source = Float32Array.from(
      { length: 4_800 },
      (_, index) => Math.sin((2 * Math.PI * 1_000 * index) / sourceRate)
    );
    const resampler = new StreamingLinearResampler(sourceRate, targetRate);
    const chunks: Float32Array[] = [];

    for (let offset = 0; offset < source.length; offset += 128) {
      chunks.push(resampler.process(source.subarray(offset, offset + 128)));
    }

    const output = concatenate(chunks);
    expect(output.length).toBe(1_600);
    for (let index = 0; index < output.length; index++) {
      const expected = Math.sin((2 * Math.PI * 1_000 * index) / targetRate);
      expect(output[index]).toBeCloseTo(expected, 5);
    }
  });
});
