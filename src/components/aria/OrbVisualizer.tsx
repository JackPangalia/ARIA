"use client";

import { OrbParticles } from "@/components/aria/OrbParticles";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useAriaStore } from "@/lib/store";
import type { AriaStatus } from "@/lib/types";

type Mode =
  | "idle"
  | "listen"
  | "followup"
  | "wake"
  | "think"
  | "speak";

function modeFor(status: AriaStatus): Mode {
  if (status === "idle" || status === "error") return "idle";
  if (status === "speaking") return "speak";
  if (status === "thinking") return "think";
  if (status === "capturing-question" || status === "wake-detected")
    return "wake";
  if (status === "follow-up-listening") return "followup";
  return "listen";
}

// Accent color per mode — drives the particle field's tint. It tweens between
// states inside OrbParticles, so transitions stay smooth.
const ACCENT: Record<Mode, string> = {
  idle: "#52525b",
  listen: "#34d399",
  followup: "#fbbf24",
  wake: "#fbbf24",
  think: "#8b5cf6",
  speak: "#ec4899",
};

// Light backgrounds need a softer idle tone so the sphere doesn't read as a
// muddy gray smear on white.
const LIGHT_IDLE_ACCENT = "#a1a1aa";

const STATUS_LABEL: Record<AriaStatus, string> = {
  idle: "Tap start",
  listening: "Listening",
  "wake-detected": "Yes?",
  "capturing-question": "Hearing you out",
  thinking: "Thinking",
  speaking: "Speaking",
  "follow-up-listening": "Anything else?",
  error: "Something went wrong",
};

function accentFor(mode: Mode, isLight: boolean): string {
  if (isLight && mode === "idle") return LIGHT_IDLE_ACCENT;
  return ACCENT[mode];
}

export function OrbVisualizer(props: {
  sessionTitle?: string;
  resume?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const status = useAriaStore((s) => s.status);
  const micLevel = useAriaStore((s) => s.micLevel);
  const error = useAriaStore((s) => s.errorMessage);

  const mode = modeFor(status);
  const isLight = resolvedTheme === "light";
  const accent = accentFor(mode, isLight);
  const showSessionTitle =
    status === "idle" && props.resume && Boolean(props.sessionTitle?.trim());
  const statusLabel = showSessionTitle
    ? props.sessionTitle!.trim()
    : STATUS_LABEL[status];

  const energy =
    mode === "listen" || mode === "wake" || mode === "followup"
      ? Math.min(1, micLevel * 10)
      : mode === "speak"
        ? 0.55
        : mode === "think"
          ? 0.3
          : 0;

  const idle = mode === "idle";

  return (
    <div className="flex flex-col items-center gap-4 sm:gap-6">
      <div className="relative h-72 w-72 origin-center select-none max-sm:-my-5 max-sm:scale-[0.82]">
        {/* The canvas renders larger than this 288px box (with the camera pulled
            back to match, in OrbParticles) so the orb has transparent headroom
            to grow into when it's loud — otherwise the expanding particles get
            clipped at the frustum edge. */}
        <OrbParticles
          className="absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2"
          color={accent}
          energy={energy}
          isLight={isLight}
        />
      </div>

      <div className="flex flex-col items-center gap-1">
        <div
          className={`max-w-xs text-center transition-colors duration-300 ${
            showSessionTitle
              ? "truncate text-sm font-normal text-app-secondary"
              : "text-[11px] font-normal uppercase tracking-[0.22em] text-app-muted pl-[0.22em]"
          }`}
          style={{ color: idle ? undefined : accent }}
          aria-live="polite"
          title={showSessionTitle ? statusLabel : undefined}
        >
          {statusLabel}
          {mode === "think" && <span className="orb-ellipsis">…</span>}
        </div>
        {error && (
          <p className="max-w-xs text-center text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
