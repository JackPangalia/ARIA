"use client";

import { useEffect, useRef, useState } from "react";
import { OrbParticles } from "@/components/aria/OrbParticles";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useAriaStore } from "@/lib/store";
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

// Accent color per mode — drives the particle field's tint. It tweens between
// states inside OrbParticles, so transitions stay smooth.
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

export function accentFor(mode: Mode, isLight: boolean): string {
  if (isLight && mode === "idle") return LIGHT_IDLE_ACCENT;
  return ACCENT[mode];
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

export function OrbVisualizer(props: {
  /** Tap the idle orb to begin recording; omitted when it can't be started. */
  onActivate?: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const status = useAriaStore((s) => s.status);
  const micLevel = useAriaStore((s) => s.micLevel);
  const error = useAriaStore((s) => s.errorMessage);
  const notice = useAriaStore((s) => s.notice);

  const mode = modeFor(status);
  const idle = mode === "idle";
  const isLight = resolvedTheme === "light";
  const accent = accentFor(mode, isLight);
  const statusLabel = STATUS_LABEL[status];

  // `micLevel` is a live room-audio meter for the whole session — the engine
  // feeds it every captured mic frame, even while Kivo is speaking (its own
  // voice bleeds back through the room mic). So we drive the orb straight off
  // real audio in every active state instead of faking a flat level. A per-mode
  // floor keeps it breathing when the room is silent — most importantly while
  // thinking, when nobody is talking and pure mic-level would flatline.
  const floor =
    mode === "idle"
      ? 0
      : mode === "think" || mode === "search"
        ? 0.4
        : mode === "speak"
          ? 0.12
          : 0.06;
  const micGain = mode === "think" || mode === "search" ? 0.5 : 1;
  const energy = mode === "idle" ? 0 : Math.min(1, floor + micLevel * micGain);

  return (
    <div className="flex flex-col items-center gap-6 sm:gap-8">
      <div className="relative h-64 w-64 origin-center select-none max-sm:-my-5 max-sm:scale-[0.82]">
        {/* Tap the resting orb to begin — the recording clock and Stop live in
            the top-bar island once it's running. */}
        {idle && props.onActivate ? (
          <button
            type="button"
            onClick={props.onActivate}
            aria-label="Start recording"
            className="absolute inset-0 z-10 cursor-pointer rounded-full"
          />
        ) : null}
        {/* The canvas renders larger than this 256px box (with the camera pulled
            back to match, in OrbParticles) so the orb has transparent headroom
            to grow into when it's loud — otherwise the expanding particles get
            clipped at the frustum edge. The gaps above/below must stay larger
            than the canvas overhang (~20% of the box per side) so the pulsing
            field never washes over the status text. */}
        <OrbParticles
          className="pointer-events-none absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2"
          color={accent}
          energy={energy}
          isLight={isLight}
        />
      </div>

      <div className="relative z-20 flex flex-col items-center gap-1">
        <div
          className={`max-w-xs text-center text-[11px] font-normal uppercase tracking-[0.22em] transition-colors duration-300 ${
            idle ? "text-app-muted pl-[0.22em]" : ""
          }`}
          style={{ color: idle ? undefined : accent }}
          aria-live="polite"
        >
          {statusLabel}
          {(mode === "think" || mode === "search") && (
            <span className="orb-ellipsis">…</span>
          )}
        </div>
        {error && (
          <p className="max-w-xs text-center text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {!error && notice && (
          <p className="max-w-xs text-center text-xs text-app-muted" aria-live="polite">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}

const SESSION_TITLE_DISPLAY =
  "block max-w-[8rem] truncate text-left text-[13px] font-medium leading-snug sm:max-w-[12rem]";

const SESSION_TITLE_EDIT =
  "block w-[min(100vw-10rem,14rem)] text-left text-[13px] font-medium leading-snug sm:w-56";

export function EditableSessionTitle(props: {
  title: string;
  onRenameTitle: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(props.title);
  }, [props.title, editing]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commitEdit = () => {
    setEditing(false);
    const next = draft.trim();
    if (!next || next === props.title) {
      setDraft(props.title);
      return;
    }
    props.onRenameTitle(next);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(props.title);
  };

  const beginEdit = () => {
    setDraft(props.title);
    setEditing(true);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
            inputRef.current?.blur();
          }
        }}
        aria-label="Session title"
        size={Math.min(Math.max(draft.length, props.title.length, 12), 80)}
        className={`${SESSION_TITLE_EDIT} border-0 bg-transparent p-0 outline-none cursor-text text-app caret-app selection:bg-accent/15`}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={beginEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          beginEdit();
        }
      }}
      className={`${SESSION_TITLE_DISPLAY} cursor-text text-app-secondary transition-colors duration-200 hover:text-app hover:underline hover:decoration-1 hover:underline-offset-[0.2em] hover:decoration-current/45 focus-visible:outline-none focus-visible:text-app focus-visible:underline focus-visible:underline-offset-[0.2em] focus-visible:decoration-current/45`}
    >
      {props.title}
    </span>
  );
}
