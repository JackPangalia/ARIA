import { describe, expect, it } from "vitest";
import { buildMicAudioConstraints } from "./mic-pcm-streamer";

describe("buildMicAudioConstraints", () => {
  it("matches live V2 speaker audio for speaker identification", () => {
    expect(
      buildMicAudioConstraints({
        voiceIdentification: true,
        continuousEchoCancellation: true,
      })
    ).toEqual({
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    });
  });

  it("keeps browser voice DSP enabled in basic mode", () => {
    expect(buildMicAudioConstraints()).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    });
  });
});
