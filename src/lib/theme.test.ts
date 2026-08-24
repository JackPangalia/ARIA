import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME, isThemePreference, resolveTheme } from "@/lib/theme";

describe("theme preferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults new users to warm light", () => {
    expect(DEFAULT_THEME).toBe("light");
  });

  it("continues accepting explicit light, dark, and system preferences", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves an explicit system preference without changing the default", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
    });
    expect(resolveTheme("system")).toBe("dark");

    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });
    expect(resolveTheme("system")).toBe("light");
  });
});
