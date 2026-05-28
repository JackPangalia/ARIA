"use client";

import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemePreference } from "@/lib/theme";

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SystemIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 3v18" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

type ThemeToggleProps = {
  variant?: "menu" | "settings";
};

const THEME_OPTIONS: {
  id: ThemePreference;
  label: string;
  Icon: typeof SunIcon;
}[] = [
  { id: "light", label: "Light", Icon: SunIcon },
  { id: "dark", label: "Dark", Icon: MoonIcon },
  { id: "system", label: "System", Icon: SystemIcon },
];

export function ThemeToggle({ variant = "menu" }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  if (variant === "settings") {
    return (
      <div className="grok-theme-grid">
        {THEME_OPTIONS.map((option) => {
          const selected = theme === option.id;
          const Icon = option.Icon;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setTheme(option.id)}
              data-selected={selected}
              className="grok-theme-card"
            >
              <Icon />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-normal text-app-secondary transition-colors hover:bg-surface-hover"
    >
      {isDark ? <SunIcon className="h-4 w-4 shrink-0" /> : <MoonIcon className="h-4 w-4 shrink-0" />}
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}
