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

type ThemeToggleProps = {
  variant?: "menu" | "settings";
};

const THEME_OPTIONS: {
  id: ThemePreference;
  label: string;
}[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

const LIGHT_MOCK = {
  bg: "#fafafa",
  side: "#f4f4f5",
  line: "#e4e4e7",
  accent: "#d4d4d8",
};

const DARK_MOCK = {
  bg: "#090909",
  side: "#18181b",
  line: "#27272a",
  accent: "#3f3f46",
};

function ThemePreviewHalf({
  mock,
}: {
  mock: typeof LIGHT_MOCK;
}) {
  return (
    <span className="grok-theme-preview-half" style={{ background: mock.bg }}>
      <span
        className="grok-theme-preview-side"
        style={{ background: mock.side }}
      />
      <span className="grok-theme-preview-body">
        <span
          className="grok-theme-preview-line"
          style={{ background: mock.accent, width: "62%" }}
        />
        <span
          className="grok-theme-preview-line"
          style={{ background: mock.line, width: "84%" }}
        />
        <span
          className="grok-theme-preview-line"
          style={{ background: mock.line, width: "46%" }}
        />
      </span>
    </span>
  );
}

function ThemePreview({ id }: { id: ThemePreference }) {
  return (
    <span className="grok-theme-preview" aria-hidden>
      {id === "system" ? (
        <>
          <ThemePreviewHalf mock={LIGHT_MOCK} />
          <ThemePreviewHalf mock={DARK_MOCK} />
        </>
      ) : (
        <ThemePreviewHalf mock={id === "light" ? LIGHT_MOCK : DARK_MOCK} />
      )}
    </span>
  );
}

export function ThemeToggle({ variant = "menu" }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  if (variant === "settings") {
    return (
      <div className="grok-theme-grid">
        {THEME_OPTIONS.map((option) => {
          const selected = theme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setTheme(option.id)}
              data-selected={selected}
              className="grok-preview-card"
            >
              <ThemePreview id={option.id} />
              <span className="grok-preview-card-label">{option.label}</span>
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
