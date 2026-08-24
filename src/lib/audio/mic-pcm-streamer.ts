"use client";

import { StreamingLinearResampler } from "./pcm-resample";

export const TARGET_SAMPLE_RATE = 16_000;

export type MicPcmStreamerOptions = {
  /** Disable NS/AGC when Speechmatics speaker ID needs stable prints. */
  voiceIdentification?: boolean;
  /** Keep live/enrollment AEC aligned and support reliable full-duplex audio. */
  continuousEchoCancellation?: boolean;
};

export function buildMicAudioConstraints(
  options: MicPcmStreamerOptions = {}
): MediaTrackConstraints {
  const voiceIdentification = options.voiceIdentification ?? false;
  const baseEchoCancellation =
    (options.continuousEchoCancellation ?? false) || !voiceIdentification;
  return {
    echoCancellation: baseEchoCancellation,
    noiseSuppression: !voiceIdentification,
    autoGainControl: !voiceIdentification,
    channelCount: 1,
  };
}

/**
 * An AudioContext pinned to the capture rate, falling back to the device rate
 * on browsers that reject the option.
 */
export function createCaptureAudioContext(): AudioContext {
  try {
    return new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  } catch {
    return new AudioContext();
  }
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
  private workletNode: AudioWorkletNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  // Basic mode and V2 speaker mode keep AEC active continuously. Enrollment
  // uses the same V2 speaker-mode constraints so its identifiers are generated
  // from the same acoustic domain used for live matching.
  private baseEchoCancellation = false;
  private playbackEchoCancellation = false;

  constructor(private options: MicPcmStreamerOptions = {}) {}

  async start(onPcm: (pcm: Int16Array) => void) {
    const constraints = buildMicAudioConstraints(this.options);
    this.baseEchoCancellation = constraints.echoCancellation === true;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: constraints,
    });
    this.audioTrack = this.stream.getAudioTracks()[0] ?? null;

    // Ask the graph itself to run at the target rate. The browser's own
    // resampler is a proper multiphase filter; StreamingLinearResampler is
    // linear interpolation, which barely attenuates content above 8kHz — at
    // 48k->16k that folds fricatives and speaker-embedding cues back into the
    // 6-7kHz band. When the context honors the request the resampler below
    // becomes a pass-through; when it doesn't (Firefox, some devices) it
    // still covers us.
    this.audioContext = createCaptureAudioContext();
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;

    const inputSampleRate = this.audioContext.sampleRate;
    const resampler = new StreamingLinearResampler(
      inputSampleRate,
      TARGET_SAMPLE_RATE
    );
    const emitSamples = (samples: Float32Array) => {
      const resampled = resampler.process(samples);
      if (resampled.length > 0) onPcm(floatToInt16(resampled));
    };

    try {
      await this.audioContext.audioWorklet.addModule("/kivo-pcm-capture.js");
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "kivo-pcm-capture",
        {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: {
            // About one Silero window per message: responsive enough for VAD
            // and barge-in without sending one main-thread message per 128
            // sample render quantum.
            chunkSamples: Math.max(
              128,
              Math.round(inputSampleRate * 0.032)
            ),
          },
        }
      );
      this.workletNode.port.onmessage = (event) => {
        const samples = event.data?.samples;
        if (event.data?.type === "samples" && samples instanceof Float32Array) {
          emitSamples(samples);
        }
      };
      this.source.connect(this.workletNode);
      this.workletNode.connect(this.silentGain);
    } catch {
      // Older browsers can lack AudioWorklet. Keep the microphone usable while
      // retaining the same continuous resampler and PCM contract.
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (event) => {
        emitSamples(event.inputBuffer.getChannelData(0));
      };
      this.source.connect(this.processor);
      this.processor.connect(this.silentGain);
    }
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
    const target = active || this.baseEchoCancellation;
    if (this.playbackEchoCancellation === active) {
      return {
        requested: target,
        actual:
          typeof this.audioTrack?.getSettings().echoCancellation === "boolean"
            ? this.audioTrack.getSettings().echoCancellation!
            : null,
      };
    }
    this.playbackEchoCancellation = active;
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
    this.workletNode?.port.close();
    this.workletNode?.disconnect();
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.silentGain?.disconnect();

    this.workletNode = null;
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
