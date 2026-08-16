import type { AriaStatus } from "@/lib/types";

export type Mode =
  | "idle"
  | "listen"
  | "followup"
  | "wake"
  | "think"
  | "search"
  | "speak";

export function modeFor(status: AriaStatus): Mode {
  if (status === "idle" || status === "error") return "idle";
  if (status === "speaking") return "speak";
  if (status === "searching") return "search";
  if (status === "thinking") return "think";
  if (status === "capturing-question" || status === "wake-detected")
    return "wake";
  if (status === "follow-up-listening") return "followup";
  return "listen";
}

// Accent color per mode — drives the visualizer's tint. It tweens between
// states inside the renderer, so transitions stay smooth.
const ACCENT: Record<Mode, string> = {
  idle: "#52525b",
  listen: "#34d399",
  followup: "#fbbf24",
  wake: "#fbbf24",
  think: "#8b5cf6",
  search: "#38bdf8",
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
  searching: "Searching the web",
  speaking: "Speaking",
  "follow-up-listening": "Anything else?",
  error: "Something went wrong",
};

/** Human label for a live Aria status — shown in the header recording strip. */
export function statusLabelFor(status: AriaStatus): string {
  return STATUS_LABEL[status];
}

export function accentFor(mode: Mode, isLight: boolean): string {
  if (isLight && mode === "idle") return LIGHT_IDLE_ACCENT;
  return ACCENT[mode];
}

/**
 * `micLevel` is a live room-audio meter for the whole session — the engine
 * feeds it every captured mic frame, even while Kivo is speaking (its own
 * voice bleeds back through the room mic). So we drive the orb straight off
 * real audio in every active state instead of faking a flat level. A per-mode
 * floor keeps it breathing when the room is silent — most importantly while
 * thinking, when nobody is talking and pure mic-level would flatline.
 */
export function energyFor(mode: Mode, micLevel: number): number {
  if (mode === "idle") return 0;
  const floor =
    mode === "think" || mode === "search"
      ? 0.4
      : mode === "speak"
        ? 0.12
        : 0.06;
  const micGain = mode === "think" || mode === "search" ? 0.5 : 1;
  return Math.min(1, floor + micLevel * micGain);
}

/**
 * UI tint for small state labels. The visualizer itself keeps the state colour
 * intentionally subdued, while these labels carry a little more contrast.
 */
export function uiAccentFor(mode: Mode, isLight: boolean): string {
  const base = accentFor(mode, isLight);
  return isLight
    ? `color-mix(in srgb, ${base} 86%, black)`
    : `color-mix(in srgb, ${base} 52%, white)`;
}

/** mm:ss (or h:mm:ss past an hour) for the recording timer. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
