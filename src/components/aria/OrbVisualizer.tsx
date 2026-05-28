"use client";

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

// Three colors per palette: [primary, secondary, accent] used for the three
// rotating aurora blobs and the core orb's radial gradient.
const PALETTES: Record<Mode, [string, string, string]> = {
  idle: ["#3f3f46", "#52525b", "#71717a"],
  listen: ["#10b981", "#34d399", "#22d3ee"],
  followup: ["#14b8a6", "#fbbf24", "#34d399"],
  wake: ["#f59e0b", "#fbbf24", "#fde68a"],
  think: ["#3b82f6", "#8b5cf6", "#22d3ee"],
  speak: ["#a855f7", "#ec4899", "#f0abfc"],
};

/** Idle sphere on light backgrounds — no outer haze, reads as a clean 3D ball. */
const LIGHT_IDLE_PALETTE: [string, string, string] = [
  "#71717a",
  "#a1a1aa",
  "#d4d4d8",
];

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

const AURORA_SPIN: Record<Mode, string> = {
  idle: "orb-spin-slow",
  listen: "orb-spin",
  followup: "orb-spin-fast",
  wake: "orb-spin-fast",
  think: "orb-spin-fast",
  speak: "orb-spin-fastest",
};

const PULSE_CLASS: Record<Mode, string> = {
  idle: "",
  listen: "",
  followup: "orb-pulse-followup",
  wake: "orb-pulse-wake",
  think: "orb-pulse-think",
  speak: "orb-pulse-speak",
};

function paletteFor(mode: Mode, isLight: boolean): [string, string, string] {
  if (isLight && mode === "idle") return LIGHT_IDLE_PALETTE;
  return PALETTES[mode];
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
  const palette = paletteFor(mode, isLight);
  const showSessionTitle =
    status === "idle" && props.resume && Boolean(props.sessionTitle?.trim());
  const statusLabel = showSessionTitle
    ? props.sessionTitle!.trim()
    : STATUS_LABEL[status];

  const energy =
    mode === "listen" ||
    mode === "wake" ||
    mode === "followup"
      ? Math.min(1, micLevel * 7)
      : mode === "speak"
        ? 0.55
        : mode === "think"
          ? 0.3
          : 0;

  const reactiveScale = 0.92 + energy * 0.18;
  const auroraSpin = AURORA_SPIN[mode];
  const pulseClass = PULSE_CLASS[mode];

  const idle = mode === "idle";
  // Light idle: sphere only — aurora/glow read as a gray box on white.
  const showAmbient = !(isLight && idle);
  const auroraOpacity = isLight
    ? idle
      ? 0
      : 0.42
    : idle
      ? 0.45
      : 0.95;
  const glowOpacity = isLight
    ? idle
      ? 0
      : 0.38
    : idle
      ? 0.25
      : 0.7;

  const orbShadow =
    isLight && idle
      ? "0 10px 32px rgba(24, 24, 27, 0.14), inset 0 2px 6px rgba(255, 255, 255, 0.45)"
      : isLight
        ? `0 0 28px 2px ${palette[1]}35, inset 0 0 24px ${palette[0]}28`
        : `0 0 40px 4px ${palette[1]}80, inset 0 0 30px ${palette[0]}40`;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative h-72 w-72 select-none">
        {showAmbient ? (
          <div
            className={`absolute inset-0 ${auroraSpin}`}
            style={{ opacity: auroraOpacity, transition: "opacity 500ms ease" }}
          >
            <div
              className="absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 -translate-y-4 rounded-full blur-3xl"
              style={{
                background: palette[0],
                transition: "background 600ms ease",
              }}
            />
            <div
              className="absolute right-0 bottom-4 h-40 w-40 translate-x-2 rounded-full blur-3xl"
              style={{
                background: palette[1],
                transition: "background 600ms ease",
              }}
            />
            <div
              className="absolute left-0 bottom-4 h-40 w-40 -translate-x-2 rounded-full blur-3xl"
              style={{
                background: palette[2],
                transition: "background 600ms ease",
              }}
            />
          </div>
        ) : null}

        {showAmbient ? (
          <div
            className="absolute inset-6 rounded-full blur-2xl"
            style={{
              background: `radial-gradient(circle, ${palette[1]}cc, transparent 70%)`,
              opacity: glowOpacity,
              transition: "opacity 500ms ease, background 600ms ease",
            }}
          />
        ) : null}

        <div
          className="absolute inset-10 rounded-full"
          style={{
            transform: `scale(${reactiveScale})`,
            transition: "transform 90ms ease-out",
          }}
        >
          <div
            className={`relative h-full w-full rounded-full ${pulseClass}`}
            style={{
              background: `radial-gradient(circle at 30% 25%, ${palette[2]}, ${palette[0]} 55%, ${palette[1]} 100%)`,
              boxShadow: orbShadow,
              transition: "background 600ms ease, box-shadow 600ms ease",
            }}
          >
            <div
              className="pointer-events-none absolute left-[22%] top-[16%] h-12 w-20 rounded-full bg-white/35 blur-2xl"
              style={{ opacity: idle ? (isLight ? 0.55 : 0.2) : 0.65 }}
            />
            <div
              className="pointer-events-none absolute inset-x-4 bottom-2 h-10 rounded-full blur-2xl"
              style={{
                background: isLight ? "rgba(24,24,27,0.12)" : "rgba(0,0,0,0.2)",
              }}
            />
          </div>
        </div>

        {(mode === "wake" || mode === "speak" || mode === "followup") && (
          <div
            className="pointer-events-none absolute inset-8 rounded-full orb-ripple"
            style={{ borderColor: palette[1] }}
          />
        )}
      </div>

      <div className="flex flex-col items-center gap-1">
        <div
          className={`max-w-xs text-center transition-colors duration-300 ${
            showSessionTitle
              ? "truncate text-sm font-normal text-app-secondary"
              : "text-[11px] font-normal uppercase tracking-[0.22em] text-app-muted pl-[0.22em]"
          }`}
          style={{ color: idle ? undefined : palette[1] }}
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
