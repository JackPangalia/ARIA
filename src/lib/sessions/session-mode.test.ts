import { describe, expect, it } from "vitest";
import {
  CreateSessionSchema,
  parseSessionMode,
  PatchSessionSchema,
  SessionModeSchema,
} from "./types";

describe("session mode parsing", () => {
  it("accepts dormant bot support", () => {
    expect(SessionModeSchema.parse("bot")).toBe("bot");
  });

  it("defaults missing and unknown persisted values to in-person", () => {
    expect(parseSessionMode(undefined)).toBe("in_person");
    expect(parseSessionMode("legacy")).toBe("in_person");
    expect(parseSessionMode("desktop_meeting")).toBe("in_person");
    expect(CreateSessionSchema.parse({ speakerCount: 2 }).mode).toBe("in_person");
  });

  it("reads sessions recorded by the removed virtual mode as in-person", () => {
    expect(parseSessionMode("virtual")).toBe("in_person");
    expect(SessionModeSchema.safeParse("virtual").success).toBe(false);
    expect(CreateSessionSchema.safeParse({ mode: "virtual" }).success).toBe(false);
  });

  it("accepts bot mode in create and patch payloads", () => {
    expect(
      CreateSessionSchema.parse({
        speakerCount: 2,
        mode: "bot",
      }).mode
    ).toBe("bot");
    expect(PatchSessionSchema.parse({ mode: "bot" }).mode).toBe("bot");
  });
});
