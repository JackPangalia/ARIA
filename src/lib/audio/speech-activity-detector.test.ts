import { describe, expect, it } from "vitest";
import { SpeechActivityDetector } from "./speech-activity-detector";

const SAMPLE_RATE = 16_000;

function sineFrame(amplitude: number, frequency = 180): Int16Array {
  const frame = new Int16Array(1_600);
  for (let i = 0; i < frame.length; i++) {
    frame[i] = Math.round(
      Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE) *
        amplitude *
        32767
    );
  }
  return frame;
}

describe("SpeechActivityDetector", () => {
  it("raises speech probability above a quiet adaptive floor", () => {
    const detector = new SpeechActivityDetector();
    for (let i = 0; i < 8; i++) detector.process(sineFrame(0.003, 60));

    const first = detector.process(sineFrame(0.12));
    const second = detector.process(sineFrame(0.12));

    expect(second.probability).toBeGreaterThan(first.probability);
    expect(second.probability).toBeGreaterThan(0.4);
  });

  it("adapts to steady background energy without staying speech-positive", () => {
    const detector = new SpeechActivityDetector({ floorAlpha: 0.2 });
    let probability = 1;
    for (let i = 0; i < 40; i++) {
      probability = detector.process(sineFrame(0.015, 60)).probability;
    }
    expect(probability).toBeLessThan(0.3);
  });
});

