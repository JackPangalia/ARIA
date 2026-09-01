import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORB_BODY,
  ORB_BODIES,
  orbBodyIndex,
  parseOrbBody,
} from "@/lib/orb/orb-body";

describe("parseOrbBody", () => {
  it("defaults to cream", () => {
    expect(DEFAULT_ORB_BODY).toBe("cream");
    expect(parseOrbBody(undefined)).toBe("cream");
    expect(parseOrbBody(null)).toBe("cream");
    expect(parseOrbBody("")).toBe("cream");
  });

  it("coerces retired planet skins and unknown values to cream", () => {
    expect(parseOrbBody("moon")).toBe("cream");
    expect(parseOrbBody("earth")).toBe("cream");
    expect(parseOrbBody("pluto")).toBe("cream");
    expect(parseOrbBody(3)).toBe("cream");
  });

  it("keeps cream and dark", () => {
    expect(ORB_BODIES).toEqual(["cream", "dark"]);
    expect(parseOrbBody("cream")).toBe("cream");
    expect(parseOrbBody("dark")).toBe("dark");
    expect(orbBodyIndex("cream")).toBe(0);
    expect(orbBodyIndex("dark")).toBe(1);
  });
});
