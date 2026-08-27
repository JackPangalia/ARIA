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

/** Floor under speak-mode energy — see `energyFor`. */
const SPEAK_FLOOR = 0.12;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Each label names the mode the session is in, because this caption is the only
 * thing telling someone whether Kivo will pick up what they say next:
 *
 *   Listening   passive — the room is being heard and transcribed, but nothing
 *               reaches Kivo until someone says "Kivo".
 *   Question    the wake word landed; this speech is being captured as the ask.
 *   Thinking / Searching the web / Speaking — working on that ask.
 *   Follow-up   the wake-free window after an answer: just talk, no wake word.
 *
 * Conversational phrasings ("Yes?", "Anything else?") read as things Kivo was
 * saying rather than states it was in, which made the two open-mic modes
 * indistinguishable from the caption alone.
 */
const STATUS_LABEL: Record<AriaStatus, string> = {
  idle: "Not listening",
  listening: "Listening",
  "wake-detected": "Question",
  "capturing-question": "Question",
  thinking: "Thinking",
  searching: "Searching the web",
  speaking: "Speaking",
  "follow-up-listening": "Follow-up",
  error: "Something went wrong",
};

/** Human label for a live Aria status — shown in the caption under the orb. */
export function statusLabelFor(status: AriaStatus): string {
  return STATUS_LABEL[status];
}

export function accentFor(mode: Mode, isLight: boolean): string {
  if (isLight && mode === "idle") return LIGHT_IDLE_ACCENT;
  return ACCENT[mode];
}

/**
 * The 0..1 envelope every orb surface animates on.
 *
 * `micLevel` is a live room-audio meter for the whole session. Echo cancellation
 * ducks Kivo's own voice out of that signal while it speaks, so speak mode rides
 * a separate tap on the answer playback instead. Other modes ride the mic, with
 * a per-mode floor so thinking doesn't go dead when the room is quiet.
 */
export function energyFor(
  mode: Mode,
  micLevel: number,
  playbackLevel = 0,
): number {
  if (mode === "idle") return 0;
  if (mode === "speak") {
    // A small floor keeps the orb alive through the gap between a turn starting
    // and the first audio landing, and if a playback path ships no tap at all.
    return clamp01(Math.max(SPEAK_FLOOR, playbackLevel));
  }
  const floor = mode === "think" || mode === "search" ? 0.4 : 0.06;
  const micGain = mode === "think" || mode === "search" ? 0.5 : 1;
  return clamp01(floor + clamp01(micLevel) * micGain);
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
