"use client";

import { useAriaStore } from "@/lib/store";
import type { AriaStatus, IntroductionMode } from "@/lib/types";

type Mode =
  | "idle"
  | "listen"
  | "intro"
  | "followup"
  | "wake"
  | "think"
  | "speak";

function modeFor(status: AriaStatus, introductionMode: IntroductionMode): Mode {
  if (status === "idle" || status === "error") return "idle";
  if (introductionMode !== "off") return "intro";
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
  intro: ["#f97316", "#fb923c", "#fde68a"],
  // Follow-up: emerald base with a warm amber accent so it reads as
  // "still listening, no wake word needed".
  followup: ["#14b8a6", "#fbbf24", "#34d399"],
  wake: ["#f59e0b", "#fbbf24", "#fde68a"],
  think: ["#3b82f6", "#8b5cf6", "#22d3ee"],
  speak: ["#a855f7", "#ec4899", "#f0abfc"],
};

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
  intro: "orb-spin-fast",
  followup: "orb-spin-fast",
  wake: "orb-spin-fast",
  think: "orb-spin-fast",
  speak: "orb-spin-fastest",
};

const PULSE_CLASS: Record<Mode, string> = {
  idle: "",
  listen: "",
  intro: "orb-pulse-intro",
  followup: "orb-pulse-followup",
  wake: "orb-pulse-wake",
  think: "orb-pulse-think",
  speak: "orb-pulse-speak",
};

export function OrbVisualizer() {
  const status = useAriaStore((s) => s.status);
  const introductionMode = useAriaStore((s) => s.introductionMode);
  const micLevel = useAriaStore((s) => s.micLevel);
  const error = useAriaStore((s) => s.errorMessage);

  const mode = modeFor(status, introductionMode);
  const palette = PALETTES[mode];
  const introLabel =
    introductionMode === "solo"
      ? "Name assignment: one voice"
      : introductionMode === "group"
        ? "Introduction mode"
        : null;
  const introDetail =
    introductionMode === "solo"
      ? "Listening for one name"
      : introductionMode === "group"
        ? "Listening for names"
        : null;

  // Energy 0..1 drives extra scale on top of the CSS pulse animation.
  // Listening states use real mic level so the orb breathes with the room.
  const energy =
    mode === "listen" ||
    mode === "wake" ||
    mode === "followup" ||
    mode === "intro"
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
  const auroraOpacity = idle ? 0.45 : 0.95;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative h-72 w-72 select-none">
        {/* Aurora layer — three orbiting colored blobs, heavily blurred. */}
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

        {/* Glow ring behind the orb. */}
        <div
          className="absolute inset-6 rounded-full blur-2xl"
          style={{
            background: `radial-gradient(circle, ${palette[1]}cc, transparent 70%)`,
            opacity: idle ? 0.25 : 0.7,
            transition: "opacity 500ms ease, background 600ms ease",
          }}
        />

        {/* Core orb wrapper carries the mic-reactive scale. */}
        <div
          className="absolute inset-10 rounded-full"
          style={{
            transform: `scale(${reactiveScale})`,
            transition: "transform 90ms ease-out",
          }}
        >
          {/* Inner pulse layer carries the CSS state animation. */}
          <div
            className={`relative h-full w-full rounded-full ${pulseClass}`}
            style={{
              background: `radial-gradient(circle at 30% 25%, ${palette[2]}, ${palette[0]} 55%, ${palette[1]} 100%)`,
              boxShadow: `0 0 40px 4px ${palette[1]}80, inset 0 0 30px ${palette[0]}40`,
              transition: "background 600ms ease, box-shadow 600ms ease",
            }}
          >
            {/* Specular highlight — gives the orb depth. */}
            <div
              className="pointer-events-none absolute left-[22%] top-[16%] h-12 w-20 rounded-full bg-white/35 blur-2xl"
              style={{ opacity: idle ? 0.2 : 0.65 }}
            />
            {/* Subtle inner shadow at the bottom. */}
            <div className="pointer-events-none absolute inset-x-4 bottom-2 h-10 rounded-full bg-black/20 blur-2xl" />
          </div>
        </div>

        {/* Ripple ring for wake / speak / follow-up — emanates outward. */}
        {(mode === "wake" ||
          mode === "speak" ||
          mode === "followup" ||
          mode === "intro") && (
          <div
            className="pointer-events-none absolute inset-8 rounded-full orb-ripple"
            style={{ borderColor: palette[1] }}
          />
        )}
      </div>

      <div className="flex flex-col items-center gap-1">
        <div
          className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500 transition-colors duration-300 dark:text-zinc-400"
          style={{ color: idle ? undefined : palette[1] }}
          aria-live="polite"
        >
          {introLabel ?? STATUS_LABEL[status]}
          {(mode === "think" || mode === "intro") && (
            <span className="orb-ellipsis">…</span>
          )}
        </div>
        {introDetail && (
          <p className="text-[11px] font-medium text-amber-200/80">
            {introDetail}
          </p>
        )}
        {error && (
          <p className="max-w-xs text-center text-xs text-red-500 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
