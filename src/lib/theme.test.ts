import { afterEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { DEFAULT_THEME, isLandingPath, isThemePreference, resolveTheme, themeInitScript } from "@/lib/theme";

describe("theme preferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults new users to warm light", () => {
    expect(DEFAULT_THEME).toBe("light");
  });

  it.each(["/guide", "/guide/", "/app"])("initializes %s before paint without overriding the app preference", (pathname) => {
    const classes = new Set<string>();
    const root = {
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
        toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name),
      },
      style: { colorScheme: "" },
    };
    runInNewContext(themeInitScript, {
      location: { pathname },
      document: { documentElement: root },
      localStorage: { getItem: () => "dark" },
    });
    expect(classes.has("landing-active")).toBe(isLandingPath(pathname));
    expect(root.style.colorScheme).toBe(pathname === "/app" ? "dark" : "light");
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
