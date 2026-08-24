class KivoPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.chunkSamples = Math.max(
      128,
      options.processorOptions?.chunkSamples ?? 512
    );
    this.buffer = new Float32Array(this.chunkSamples);
    this.offset = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    // Keep the graph alive without routing microphone audio to the speakers.
    output?.fill(0);

    if (input?.length) {
      let inputOffset = 0;
      while (inputOffset < input.length) {
        const count = Math.min(
          input.length - inputOffset,
          this.chunkSamples - this.offset
        );
        this.buffer.set(
          input.subarray(inputOffset, inputOffset + count),
          this.offset
        );
        this.offset += count;
        inputOffset += count;

        if (this.offset === this.chunkSamples) {
          const samples = this.buffer;
          this.port.postMessage({ type: "samples", samples }, [samples.buffer]);
          this.buffer = new Float32Array(this.chunkSamples);
          this.offset = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor("kivo-pcm-capture", KivoPcmCaptureProcessor);
