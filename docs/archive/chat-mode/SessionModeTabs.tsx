"use client";

import { accentFor, modeFor } from "@/components/aria/OrbVisualizer";
import { useAriaStore } from "@/lib/store";
import { useTheme } from "@/components/theme/ThemeProvider";

export type SessionTab = "voice" | "chat";

const TABS: { id: SessionTab; label: string }[] = [
  { id: "voice", label: "Voice" },
  { id: "chat", label: "Chat" },
];

/** Small always-present orb pulse — keeps Kivo's presence visible on Chat/Notes,
 * where the full-size orb isn't on screen. */
function MiniOrbIndicator() {
  const { resolvedTheme } = useTheme();
  const status = useAriaStore((s) => s.status);
  const mode = modeFor(status);
  const isLight = resolvedTheme === "light";
  const accent = accentFor(mode, isLight);
  const idle = mode === "idle";

  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 rounded-full transition-colors duration-300 ${
        idle ? "" : "animate-pulse"
      }`}
      style={{ backgroundColor: accent }}
    />
  );
}

export function SessionModeTabs(props: {
  activeTab: SessionTab;
  onChange: (tab: SessionTab) => void;
}) {
  return (
    <div className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-app bg-app p-0.5 text-[11px] tracking-[0.1em]">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => props.onChange(tab.id)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 uppercase transition-colors ${
            props.activeTab === tab.id
              ? "bg-accent text-accent-fg"
              : "text-app-subtle hover:text-app-secondary"
          }`}
        >
          {tab.id !== "voice" ? <MiniOrbIndicator /> : null}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
