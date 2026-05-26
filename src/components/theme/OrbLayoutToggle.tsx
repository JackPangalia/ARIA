"use client";

import {
  ORB_CENTER_DESCRIPTION,
  ORB_CENTER_LABEL,
  type OrbCenterMode,
} from "@/lib/orb-layout";
import { useOrbLayout } from "@/components/theme/OrbLayoutProvider";

function AlignPaneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <rect
        x="3"
        y="4"
        width="7"
        height="16"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="16" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function AlignScreenIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

type OrbLayoutToggleProps = {
  variant?: "menu" | "settings";
};

export function OrbLayoutToggle({ variant = "menu" }: OrbLayoutToggleProps) {
  const { mode, toggleMode, setMode } = useOrbLayout();
  const isViewport = mode === "viewport";

  if (variant === "settings") {
    return (
      <div>
        <p className="text-[9px] tracking-[0.22em] text-app-muted">ORB POSITION</p>
        <p className="mt-2 text-sm text-app">{ORB_CENTER_LABEL[mode]}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-app-subtle">
          {ORB_CENTER_DESCRIPTION[mode]}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(["pane", "viewport"] as OrbCenterMode[]).map((option) => {
            const selected = mode === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                  selected
                    ? "border-app-strong bg-surface-selected text-app"
                    : "border-app bg-app text-app-secondary hover:bg-surface-hover"
                }`}
              >
                <span className="mb-2 inline-flex">
                  {option === "pane" ? <AlignPaneIcon /> : <AlignScreenIcon />}
                </span>
                <span className="block text-xs font-medium">
                  {ORB_CENTER_LABEL[option]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleMode}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-app-secondary transition-colors hover:bg-surface-hover"
    >
      {isViewport ? (
        <AlignScreenIcon className="shrink-0" />
      ) : (
        <AlignPaneIcon className="shrink-0" />
      )}
      {isViewport ? "Use pane center" : "Use screen center"}
    </button>
  );
}
