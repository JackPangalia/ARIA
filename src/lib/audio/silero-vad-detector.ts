"use client";

import {
  SpeechActivityDetector,
  type LocalSpeechDetector,
} from "./speech-activity-detector";

/**
 * Silero VAD v5 speech detector — a neural speech-vs-silence probability that is
 * sharper and less noise-fooled than the RMS gate, giving `observeLocalSpeech`
 * faster, more reliable speech-onset/end. Tighter speech-end in turn lets the
 * clear-ask endpoint force (and its speculative dispatch) fire sooner.
 *
 * The model is async (ONNX Runtime Web), but `observeLocalSpeech` calls
 * `process()` synchronously per mic frame. So `process()` only *buffers* samples
 * and returns the most recently computed probability (≤ one 32 ms window stale);
 * a self-driving pump drains 512-sample windows through the model as fast as
 * inference allows. Until the model loads — and permanently if it fails to — the
 * detector delegates to an internal RMS `SpeechActivityDetector`, so the engine
 * always has a working gate.
 *
 * Assets are served from /public: the model at `/silero-vad.onnx` and the ORT
 * wasm from `/ort/` (see `onnxruntime-web`). Runs single-threaded so it needs no
 * cross-origin isolation.
 */

// Silero v5 @ 16 kHz consumes exactly 512-sample windows and carries a
// [2,1,128] recurrent state between them.
const WINDOW_SAMPLES = 512;
const STATE_SHAPE = [2, 1, 128] as const;
const STATE_LENGTH = 2 * 1 * 128;
// Cap the backlog so a slow/stalled pump drops stale audio instead of growing
// unbounded — VAD only cares about the most recent speech.
const MAX_BUFFERED_SAMPLES = WINDOW_SAMPLES * 8;

export interface SileroVadOptions {
  /** Model URL under /public. */
  modelUrl?: string;
  /** Directory holding the ORT wasm binaries under /public. */
  wasmPath?: string;
  sampleRate?: number;
}

// Minimal structural types so this module never has to import ORT at the top
// level (which would evaluate wasm glue during SSR bundling).
type OrtTensor = { data: unknown };
type OrtSession = {
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
};

export class SileroVadDetector implements LocalSpeechDetector {
  private readonly modelUrl: string;
  private readonly wasmPath: string;
  private readonly sampleRate: number;
  private readonly fallback = new SpeechActivityDetector();

  private session: OrtSession | null = null;
  private makeTensor:
    | ((type: string, data: unknown, dims?: readonly number[]) => unknown)
    | null = null;
  private state = new Float32Array(STATE_LENGTH);
  private readonly buffer = new Float32Array(MAX_BUFFERED_SAMPLES);
  private bufLen = 0;
  private lastProbability = 0;
  private pumping = false;
  private ready = false;
  private failed = false;

  constructor(options: SileroVadOptions = {}) {
    this.modelUrl = options.modelUrl ?? "/silero-vad.onnx";
    this.wasmPath = options.wasmPath ?? "/ort/";
    this.sampleRate = options.sampleRate ?? 16_000;
  }

  get isReady(): boolean {
    return this.ready;
  }

  get isFailed(): boolean {
    return this.failed;
  }

  /** Load the ORT runtime + model. Resolves to false if unavailable (the
   * detector then stays permanently on the RMS fallback). Safe to await once. */
  async init(): Promise<boolean> {
    if (this.ready) return true;
    if (this.failed) return false;
    try {
      // The package root resolves to the WebGPU bundle, whose loader fetches
      // `ort-wasm-simd-threaded.jsep.*`. This detector is wasm-only, so import
      // the wasm build — it loads the plain binaries actually served from /ort.
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.wasmPaths = this.wasmPath;
      // Single-threaded avoids the SharedArrayBuffer / cross-origin-isolation
      // requirement; the model is tiny, so it's plenty fast.
      ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create(this.modelUrl, {
        executionProviders: ["wasm"],
      });
      this.session = session as unknown as OrtSession;
      this.makeTensor = (type, data, dims) =>
        dims === undefined
          ? new ort.Tensor(
              type as "float32",
              data as Float32Array
            )
          : new ort.Tensor(type as "float32", data as Float32Array, dims as number[]);
      this.state.fill(0);
      this.bufLen = 0;
      this.ready = true;
      return true;
    } catch (err) {
      this.failed = true;
      console.warn("[SileroVAD] init failed — using RMS fallback:", err);
      return false;
    }
  }

  reset(): void {
    this.state.fill(0);
    this.bufLen = 0;
    this.lastProbability = 0;
    this.fallback.reset();
  }

  process(frame: Int16Array): { probability: number } {
    // Keep the RMS detector warm (adaptive floor) and use it whenever the model
    // isn't (yet) serving — before load and permanently after a failure.
    const rms = this.fallback.process(frame);
    if (this.failed || !this.ready) return { probability: rms.probability };

    this.appendSamples(frame);
    if (!this.pumping) void this.pump();
    return { probability: this.lastProbability };
  }

  private appendSamples(frame: Int16Array): void {
    for (let i = 0; i < frame.length; i++) {
      if (this.bufLen >= this.buffer.length) {
        // Backlog full — drop the oldest window's worth so recent audio wins.
        this.buffer.copyWithin(0, WINDOW_SAMPLES, this.bufLen);
        this.bufLen -= WINDOW_SAMPLES;
      }
      this.buffer[this.bufLen++] = frame[i]! / 32768;
    }
  }

  private async pump(): Promise<void> {
    this.pumping = true;
    try {
      while (this.bufLen >= WINDOW_SAMPLES && this.session && !this.failed) {
        const window = this.buffer.slice(0, WINDOW_SAMPLES);
        this.buffer.copyWithin(0, WINDOW_SAMPLES, this.bufLen);
        this.bufLen -= WINDOW_SAMPLES;
        await this.infer(window);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async infer(window: Float32Array): Promise<void> {
    const session = this.session;
    const makeTensor = this.makeTensor;
    if (!session || !makeTensor) return;
    try {
      const feeds = {
        input: makeTensor("float32", window, [1, WINDOW_SAMPLES]),
        state: makeTensor("float32", this.state, STATE_SHAPE),
        sr: makeTensor("int64", BigInt64Array.from([BigInt(this.sampleRate)])),
      };
      const out = await session.run(feeds);
      const prob = (out.output?.data as Float32Array | undefined)?.[0];
      if (typeof prob === "number") this.lastProbability = prob;
      const nextState = out.stateN?.data as Float32Array | undefined;
      // Copy into an ArrayBuffer-backed array (the ORT tensor may be
      // SharedArrayBuffer-backed); 128 floats, negligible per 32 ms window.
      if (nextState && nextState.length === STATE_LENGTH) {
        this.state = new Float32Array(nextState);
      }
    } catch (err) {
      // A single bad inference shouldn't kill the gate — fall back permanently.
      this.failed = true;
      console.warn("[SileroVAD] inference failed — using RMS fallback:", err);
    }
  }
}
