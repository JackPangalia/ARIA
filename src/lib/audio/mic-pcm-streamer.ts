"use client";

const TARGET_SAMPLE_RATE = 16_000;

function downsample(
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

function floatToInt16(input: Float32Array): Int16Array {
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

  async start(onPcm: (pcm: Int16Array) => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

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

  async stop() {
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
