import { describe, expect, it, vi } from "vitest";
import { VoiceTurnController } from "./voice-turn-controller";

describe("VoiceTurnController", () => {
  it("invalidates late generations when interrupted during generation", () => {
    const onInterrupt = vi.fn();
    const controller = new VoiceTurnController({ onInterrupt });
    const generation = controller.beginGeneration();

    expect(controller.interrupt()).toBe(true);
    expect(controller.isCurrent(generation)).toBe(false);
    expect(controller.beginSpeaking(generation)).toBe(false);
    expect(onInterrupt).toHaveBeenCalledWith("generating");
  });

  it("invalidates late playback callbacks after stop", () => {
    const controller = new VoiceTurnController();
    const generation = controller.beginGeneration();
    expect(controller.beginSpeaking(generation)).toBe(true);

    controller.invalidate("listening");

    expect(controller.finish(generation)).toBe(false);
    expect(controller.currentPhase).toBe("listening");
  });
});

