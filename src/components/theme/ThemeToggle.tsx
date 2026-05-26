"use client";

import { useTheme } from "@/components/theme/ThemeProvider";

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ThemeToggleProps = {
  variant?: "menu" | "settings";
};

export function ThemeToggle({ variant = "menu" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  if (variant === "settings") {
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[9px] tracking-[0.22em] text-app-muted">APPEARANCE</p>
          <p className="mt-2 text-sm text-app">
            {isDark ? "Dark mode" : "Light mode"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!isDark}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={toggleTheme}
          className="relative h-8 w-14 shrink-0 rounded-full border border-app bg-surface transition-colors"
        >
          <span
            className={`absolute top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm transition-transform ${
              isDark ? "left-1" : "left-7"
            }`}
          >
            {isDark ? <MoonIcon /> : <SunIcon />}
          </span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-app-secondary transition-colors hover:bg-surface-hover"
    >
      {isDark ? <SunIcon className="shrink-0" /> : <MoonIcon className="shrink-0" />}
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}
