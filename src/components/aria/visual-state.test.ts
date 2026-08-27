import { describe, expect, it } from "vitest";
import { modeFor, statusLabelFor } from "@/components/aria/visual-state";
import type { AriaStatus } from "@/lib/types";

const ALL_STATUSES: AriaStatus[] = [
  "idle",
  "listening",
  "wake-detected",
  "capturing-question",
  "thinking",
  "searching",
  "speaking",
  "follow-up-listening",
  "error",
];

/**
 * The caption under the orb is the only thing that tells someone whether Kivo
 * will pick up what they say next, so each label has to name the mode rather
 * than sound like something Kivo is saying.
 */
describe("statusLabelFor", () => {
  it("names the three modes a person has to tell apart", () => {
    // Passive: heard and transcribed, but a wake word is required.
    expect(statusLabelFor("listening")).toBe("Listening");
    // Wake word landed — this speech becomes the question.
    expect(statusLabelFor("capturing-question")).toBe("Question");
    // Wake-free window after an answer.
    expect(statusLabelFor("follow-up-listening")).toBe("Follow-up");
  });

  it("labels the working states", () => {
    expect(statusLabelFor("thinking")).toBe("Thinking");
    expect(statusLabelFor("searching")).toBe("Searching the web");
    expect(statusLabelFor("speaking")).toBe("Speaking");
  });

  it("never reads as passive listening when the session isn't live", () => {
    expect(statusLabelFor("idle")).not.toBe(statusLabelFor("listening"));
    expect(statusLabelFor("error")).not.toBe(statusLabelFor("listening"));
  });

  it("never phrases a state as a line of Kivo's dialogue", () => {
    for (const status of ALL_STATUSES) {
      expect(statusLabelFor(status)).not.toMatch(/\?$/);
    }
  });

  it("gives passive listening and the follow-up window different words", () => {
    expect(statusLabelFor("listening")).not.toBe(
      statusLabelFor("follow-up-listening")
    );
  });
});

describe("modeFor", () => {
  it("keeps the follow-up window visually distinct from passive listening", () => {
    expect(modeFor("listening")).toBe("listen");
    expect(modeFor("follow-up-listening")).toBe("followup");
  });

  it("treats both wake states as question capture", () => {
    expect(modeFor("wake-detected")).toBe("wake");
    expect(modeFor("capturing-question")).toBe("wake");
  });
});
