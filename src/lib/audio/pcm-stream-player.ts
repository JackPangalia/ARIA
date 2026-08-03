"use client";

type PcmEncoding = "pcm_f32le" | "pcm_s16le";

export interface PcmStreamPlayerOptions {
  context: AudioContext;
  destination: AudioNode;
  sourceSampleRate: number;
  encoding: PcmEncoding;
  prebufferMs: number;
  onStarted?: () => void;
  onUnderrun?: () => void;
  onEnded?: () => void;
}

const loadedContexts = new WeakSet<AudioContext>();

function decodePcm(bytes: Uint8Array, encoding: PcmEncoding): Float32Array {
  if (encoding === "pcm_f32le") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const samples = new Float32Array(bytes.byteLength / 4);
    for (let i = 0; i < samples.length; i++) {
      const value = view.getFloat32(i * 4, true);
      samples[i] = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    }
    return samples;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 32768;
  }
  return samples;
}

function resampleLinear(
  input: Float32Array,
  sourceRate: number,
  targetRate: number
): Float32Array {
  if (sourceRate === targetRate || input.length < 2) return input;
  const length = Math.max(1, Math.round((input.length * targetRate) / sourceRate));
  const output = new Float32Array(length);
  const ratio = sourceRate / targetRate;
  for (let i = 0; i < length; i++) {
    const sourceIndex = i * ratio;
    const left = Math.min(input.length - 1, Math.floor(sourceIndex));
    const right = Math.min(input.length - 1, left + 1);
    const mix = sourceIndex - left;
    output[i] = input[left]! * (1 - mix) + input[right]! * mix;
  }
  return output;
}

/**
 * Jitter-tolerant raw PCM playback. Network chunks enter an AudioWorklet ring
 * buffer; interruption clears that buffer synchronously and disconnects output.
 */
export class PcmStreamPlayer {
  private node: AudioWorkletNode | null = null;
  private leftover = new Uint8Array(0);
  private stopped = false;
  private startedAt: number | null = null;

  private constructor(private readonly options: PcmStreamPlayerOptions) {}

  static async create(options: PcmStreamPlayerOptions): Promise<PcmStreamPlayer> {
    const player = new PcmStreamPlayer(options);
    await player.initialize();
    return player;
  }

  get playbackSeconds(): number {
    if (this.startedAt == null) return 0;
    return Math.max(0, this.options.context.currentTime - this.startedAt);
  }

  private async initialize(): Promise<void> {
    const { context } = this.options;
    if (!loadedContexts.has(context)) {
      await context.audioWorklet.addModule("/kivo-pcm-player.js");
      loadedContexts.add(context);
    }

    const prebufferSamples = Math.round(
      (context.sampleRate * this.options.prebufferMs) / 1000
    );
    this.node = new AudioWorkletNode(context, "kivo-pcm-player", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { prebufferSamples },
    });
    this.node.port.onmessage = (event) => {
      if (event.data?.type === "started") {
        this.startedAt = context.currentTime;
        this.options.onStarted?.();
      } else if (event.data?.type === "underrun") {
        this.options.onUnderrun?.();
      } else if (event.data?.type === "ended") {
        this.options.onEnded?.();
      }
    };
    this.node.connect(this.options.destination);
  }

  push(chunk: Uint8Array): void {
    if (this.stopped || !this.node || chunk.byteLength === 0) return;
    const bytesPerSample = this.options.encoding === "pcm_f32le" ? 4 : 2;
    const combined = new Uint8Array(this.leftover.length + chunk.length);
    combined.set(this.leftover, 0);
    combined.set(chunk, this.leftover.length);
    const usable = combined.length - (combined.length % bytesPerSample);
    this.leftover = combined.slice(usable);
    if (usable === 0) return;

    const decoded = decodePcm(combined.slice(0, usable), this.options.encoding);
    const samples = resampleLinear(
      decoded,
      this.options.sourceSampleRate,
      this.options.context.sampleRate
    );
    this.node.port.postMessage({ type: "push", samples }, [samples.buffer]);
  }

  finish(): void {
    if (this.stopped || !this.node) return;
    this.node.port.postMessage({ type: "end" });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.node) {
      this.node.port.postMessage({ type: "clear" });
      this.node.port.onmessage = null;
      try {
        this.node.disconnect();
      } catch {
        // already disconnected
      }
      this.node = null;
    }
    this.leftover = new Uint8Array(0);
  }
}

