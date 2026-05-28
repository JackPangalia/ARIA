export type ThemePreference = "light" | "dark" | "system";

/** @deprecated Use ThemePreference */
export type Theme = ThemePreference;

export const THEME_STORAGE_KEY = "aria-theme";

export const DEFAULT_THEME: ThemePreference = "dark";

export function isThemePreference(
  value: string | null | undefined
): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function isTheme(value: string | null | undefined): value is ThemePreference {
  return isThemePreference(value);
}

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return preference;
}

export function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME;

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function storeTheme(theme: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

export function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export const themeInitScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);var d=t==="light"?false:t==="dark"?true:window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}})();`;
