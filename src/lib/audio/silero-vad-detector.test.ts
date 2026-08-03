import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.hoisted(() => vi.fn());
const runMock = vi.hoisted(() => vi.fn());

vi.mock("onnxruntime-web/wasm", () => {
  class Tensor {
    constructor(
      public type: string,
      public data: unknown,
      public dims?: readonly number[]
    ) {}
  }
  return {
    env: { wasm: { wasmPaths: "", numThreads: 1, simd: true } },
    Tensor,
    InferenceSession: { create: createMock },
  };
});

import { SileroVadDetector } from "./silero-vad-detector";

const STATE_LENGTH = 2 * 1 * 128;

function frame(samples: number, value = 0): Int16Array {
  const f = new Int16Array(samples);
  f.fill(value);
  return f;
}

describe("SileroVadDetector", () => {
  beforeEach(() => {
    createMock.mockReset();
    runMock.mockReset();
    createMock.mockResolvedValue({ run: runMock });
    runMock.mockResolvedValue({
      output: { data: new Float32Array([0.92]) },
      stateN: { data: new Float32Array(STATE_LENGTH) },
    });
  });

  it("uses the RMS fallback before the model is ready", () => {
    const detector = new SileroVadDetector();
    expect(detector.isReady).toBe(false);
    // Loud frame → the fallback should report a real, finite probability.
    const { probability } = detector.process(frame(512, 12000));
    expect(Number.isFinite(probability)).toBe(true);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("runs the model once a full window is buffered and surfaces its probability", async () => {
    const detector = new SileroVadDetector();
    expect(await detector.init()).toBe(true);
    expect(detector.isReady).toBe(true);

    detector.process(frame(512, 12000));

    await vi.waitFor(() => {
      expect(runMock).toHaveBeenCalled();
      expect(detector.process(frame(0)).probability).toBeCloseTo(0.92, 2);
    });

    // The model was fed the three named v5 inputs.
    const feeds = runMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(feeds).sort()).toEqual(["input", "sr", "state"]);
  });

  it("falls back permanently when the model can't load", async () => {
    createMock.mockRejectedValueOnce(new Error("no wasm"));
    const detector = new SileroVadDetector();
    expect(await detector.init()).toBe(false);
    expect(detector.isFailed).toBe(true);

    // Still a working gate via RMS; never touches the model.
    const { probability } = detector.process(frame(512, 12000));
    expect(Number.isFinite(probability)).toBe(true);
    expect(runMock).not.toHaveBeenCalled();
  });
});
