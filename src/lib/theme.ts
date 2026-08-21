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

export function isLandingPath(pathname: string): boolean {
  return pathname === "/" || pathname === "";
}

export function isLandingActive(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("landing-active");
}

/** Pin marketing to the light product canvas, regardless of app theme. */
export function applyLandingTheme() {
  const root = document.documentElement;
  root.classList.add("landing-active");
  root.classList.remove("dark");
  root.style.colorScheme = "light";
}

export function clearLandingTheme() {
  const root = document.documentElement;
  root.classList.remove("landing-active");
  document.body?.classList.remove("landing-active", "menu-locked");
}

export function applyTheme(preference: ThemePreference) {
  if (typeof document !== "undefined" && isLandingActive()) return;

  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export const themeInitScript = `(function(){try{var p=location.pathname;if(p==="/"||p===""){document.documentElement.classList.add("landing-active");document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light";return;}var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);var d=t==="light"?false:t==="dark"?true:window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}})();`;
