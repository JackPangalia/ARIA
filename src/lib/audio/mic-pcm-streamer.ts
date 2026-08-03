"use client";

export const TARGET_SAMPLE_RATE = 16_000;

export type MicPcmStreamerOptions = {
  /** Disable browser voice DSP when Speechmatics speaker ID needs stable prints. */
  voiceIdentification?: boolean;
  /** V2 prioritizes reliable full-duplex AEC, including speaker mode. */
  continuousEchoCancellation?: boolean;
};

export function downsample(
  input: Float32Array,
  inputSampleRate: number
): Float32Array {
  if (inputSampleRate === TARGET_SAMPLE_RATE) return input;
  if (inputSampleRate < TARGET_SAMPLE_RATE) {
    throw new Error(
      `Unsupported input sample rate: ${inputSampleRate}Hz`
    );
  }

  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    output[i] = sum / Math.max(1, end - start);
  }

  return output;
}

export function floatToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

export class MicPcmStreamer {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  // Echo cancellation is only worth its cost while Kivo is actually speaking —
  // that's the only time there's an echo to cancel and the only time barge-in
  // runs. The rest of the time we want the rawest possible feed for
  // recognition and (in speaker mode) diarization, so AEC falls back to this
  // base: on for basic mode, off when we need untouched voiceprints.
  private baseEchoCancellation = false;
  private playbackEchoCancellation = false;

  constructor(private options: MicPcmStreamerOptions = {}) {}

  async start(onPcm: (pcm: Int16Array) => void) {
    const voiceIdentification = this.options.voiceIdentification ?? false;
    this.baseEchoCancellation =
      (this.options.continuousEchoCancellation ?? false) || !voiceIdentification;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: this.baseEchoCancellation,
        noiseSuppression: !voiceIdentification,
        autoGainControl: !voiceIdentification,
        channelCount: 1,
      },
    });
    this.audioTrack = this.stream.getAudioTracks()[0] ?? null;

    this.audioContext = new AudioContext();
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;

    const inputSampleRate = this.audioContext.sampleRate;

    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const downsampled = downsample(input, inputSampleRate);
      onPcm(floatToInt16(downsampled));
    };

    // ScriptProcessorNode must be connected to run. The gain node keeps the
    // processing graph alive without playing mic audio back to the speakers.
    this.source.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(this.audioContext.destination);
  }

  /**
   * Engage (or release) echo cancellation for the duration of assistant
   * playback. During playback AEC removes Kivo's own voice so it can't be
   * transcribed as the user or trip the barge-in detector; the rest of the
   * time the mic returns to its raw base so normal recognition/diarization is
   * untouched. Toggled live via applyConstraints — best-effort, since not
   * every browser honors it without renegotiation.
   */
  async setPlaybackEchoCancellation(
    active: boolean
  ): Promise<{ requested: boolean; actual: boolean | null }> {
    if (this.playbackEchoCancellation === active) {
      return {
        requested: active,
        actual:
          typeof this.audioTrack?.getSettings().echoCancellation === "boolean"
            ? this.audioTrack.getSettings().echoCancellation!
            : null,
      };
    }
    this.playbackEchoCancellation = active;
    const target = active || this.baseEchoCancellation;
    const track = this.audioTrack;
    if (!track) return { requested: target, actual: null };
    try {
      await track.applyConstraints({ echoCancellation: target });
      const actual = track.getSettings().echoCancellation;
      return {
        requested: target,
        actual: typeof actual === "boolean" ? actual : null,
      };
    } catch {
      // The track keeps its current AEC setting; barge-in may be a touch less
      // clean, but recognition is never blocked on this.
      const actual = track.getSettings().echoCancellation;
      return {
        requested: target,
        actual: typeof actual === "boolean" ? actual : null,
      };
    }
  }

  async stop() {
    this.audioTrack = null;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.silentGain?.disconnect();

    this.processor = null;
    this.source = null;
    this.silentGain = null;

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close();
    }
    this.audioContext = null;
  }
}
