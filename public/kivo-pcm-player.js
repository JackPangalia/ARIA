class KivoPcmPlayerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const requested = options.processorOptions?.prebufferSamples ?? 0;
    this.prebufferSamples = Math.max(0, requested);
    this.queue = [];
    this.queueOffset = 0;
    this.queuedSamples = 0;
    this.started = false;
    this.ending = false;
    this.ended = false;
    this.wasStarved = false;

    this.port.onmessage = (event) => {
      const message = event.data;
      if (message?.type === "push" && message.samples instanceof Float32Array) {
        this.queue.push(message.samples);
        this.queuedSamples += message.samples.length;
        return;
      }
      if (message?.type === "end") {
        this.ending = true;
        return;
      }
      if (message?.type === "clear") {
        this.queue = [];
        this.queueOffset = 0;
        this.queuedSamples = 0;
        this.started = false;
        this.ending = true;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;
    output.fill(0);

    if (
      !this.started &&
      (this.queuedSamples >= this.prebufferSamples ||
        (this.ending && this.queuedSamples > 0))
    ) {
      this.started = true;
      this.port.postMessage({ type: "started" });
    }

    if (!this.started) return true;

    let writeOffset = 0;
    while (writeOffset < output.length && this.queue.length > 0) {
      const current = this.queue[0];
      const available = current.length - this.queueOffset;
      const count = Math.min(available, output.length - writeOffset);
      output.set(
        current.subarray(this.queueOffset, this.queueOffset + count),
        writeOffset
      );
      writeOffset += count;
      this.queueOffset += count;
      this.queuedSamples -= count;
      if (this.queueOffset >= current.length) {
        this.queue.shift();
        this.queueOffset = 0;
      }
    }

    if (writeOffset < output.length && !this.ending) {
      if (!this.wasStarved) {
        this.wasStarved = true;
        this.port.postMessage({ type: "underrun" });
      }
    } else {
      this.wasStarved = false;
    }

    if (this.ending && this.queuedSamples === 0 && !this.ended) {
      this.ended = true;
      this.port.postMessage({ type: "ended" });
    }

    return !this.ended;
  }
}

registerProcessor("kivo-pcm-player", KivoPcmPlayerProcessor);

