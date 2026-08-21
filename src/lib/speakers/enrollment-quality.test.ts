import { describe, expect, it } from "vitest";
import { EnrollmentQualityTracker } from "./enrollment-quality";

const FRAME_SAMPLES = 512;

describe("EnrollmentQualityTracker", () => {
  it("leaves speech usability to Speechmatics", () => {
    const tracker = new EnrollmentQualityTracker();
    for (let frame = 0; frame < 300; frame++) {
      tracker.process(new Int16Array(FRAME_SAMPLES));
    }

    expect(tracker.result().failure).toBeNull();
  });

  it("rejects objectively clipped audio", () => {
    const tracker = new EnrollmentQualityTracker();
    for (let frame = 0; frame < 10; frame++) {
      const clipped = new Int16Array(FRAME_SAMPLES);
      clipped.fill(0x7fff);
      tracker.process(clipped);
    }

    expect(tracker.result().failure).toBe("clipping");
  });
});
