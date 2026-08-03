import { describe, expect, it, vi } from "vitest";
import { BargeInDetector } from "./barge-in-detector";

// 100ms frames at 16 kHz keep the timing math clean for assertions.
const SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 1_600;

function frameAtRms(rms: number): Int16Array {
  const value = Math.round(rms * 32768);
  const frame = new Int16Array(FRAME_SAMPLES);
  frame.fill(value);
  return frame;
}

const SILENCE = () => frameAtRms(0.002);
const SPEECH = () => frameAtRms(0.1);

function makeDetector() {
  const onSuspected = vi.fn();
  const onConfirmed = vi.fn();
  const onEnded = vi.fn();
  const detector = new BargeInDetector(
    { onSuspected, onConfirmed, onEnded },
    { sampleRate: SAMPLE_RATE }
  );
  return { detector, onSuspected, onConfirmed, onEnded };
}

function feed(detector: BargeInDetector, frames: Int16Array[]) {
  for (const frame of frames) detector.process(frame);
}

describe("BargeInDetector", () => {
  it("does nothing while stopped", () => {
    const { detector, onSuspected, onConfirmed } = makeDetector();
    feed(detector, Array.from({ length: 10 }, SPEECH));
    expect(onSuspected).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("stays silent through pure silence", () => {
    const { detector, onSuspected, onConfirmed } = makeDetector();
    detector.start();
    feed(detector, Array.from({ length: 20 }, SILENCE));
    expect(onSuspected).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("suspects then confirms on sustained speech", () => {
    const { detector, onSuspected, onConfirmed, onEnded } = makeDetector();
    detector.start();
    // Prime the floor with 2 silent frames (200ms), then sustained speech.
    feed(detector, [SILENCE(), SILENCE()]);
    // duckMs=140 -> 2 speech frames; confirmMs=320 -> 4 speech frames.
    detector.process(SPEECH());
    expect(onSuspected).not.toHaveBeenCalled();
    detector.process(SPEECH());
    expect(onSuspected).toHaveBeenCalledTimes(1);
    expect(onConfirmed).not.toHaveBeenCalled();
    detector.process(SPEECH());
    detector.process(SPEECH());
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(onConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ onsetSecondsAgo: expect.any(Number) })
    );
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("un-ducks (onEnded) when a suspicion stops before confirmation", () => {
    const { detector, onSuspected, onConfirmed, onEnded } = makeDetector();
    detector.start();
    feed(detector, [SILENCE(), SILENCE()]);
    // Reach 'suspected' (2 speech frames) but not 'confirmed'.
    detector.process(SPEECH());
    detector.process(SPEECH());
    expect(onSuspected).toHaveBeenCalledTimes(1);
    // Now go quiet past the hangover (180ms -> 2 silent frames).
    detector.process(SILENCE());
    detector.process(SILENCE());
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("ignores steady residual echo at the primed floor level", () => {
    const { detector, onSuspected, onConfirmed } = makeDetector();
    detector.start();
    // Prime the floor to a moderate residual-echo level, then keep it steady.
    const echo = () => frameAtRms(0.03);
    feed(detector, [echo(), echo()]);
    feed(detector, Array.from({ length: 10 }, echo));
    expect(onSuspected).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("resets between playback sessions on restart", () => {
    const { detector, onConfirmed } = makeDetector();
    detector.start();
    feed(detector, [SILENCE(), SILENCE(), SPEECH(), SPEECH()]);
    detector.stop();
    detector.start();
    // A fresh prime window means the two speech frames alone shouldn't confirm.
    detector.process(SPEECH());
    detector.process(SPEECH());
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});
