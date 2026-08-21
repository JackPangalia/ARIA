"use client";

import {
  formatElapsed,
  modeFor,
  statusLabelFor,
} from "@/components/aria/visual-state";
import type { AriaStatus } from "@/lib/types";

/**
 * Quiet recording control in the session header — timer, live status, and
 * Start/Stop. Styled like the Overview/Resume tabs, not a floating device.
 * Status labels stay one muted color; the orb and live transcript carry the room.
 */
export function RecordingIsland(props: {
  isRunning: boolean;
  busy: boolean;
  elapsedMs: number;
  resume: boolean;
  disabled: boolean;
  status: AriaStatus;
  onStart: () => void;
  onStop: () => void;
  onStopSpeaking: () => void;
}) {
  const mode = modeFor(props.status);
  const liveStatus =
    props.isRunning && mode !== "idle" ? statusLabelFor(props.status) : null;
  const showEllipsis = mode === "think" || mode === "search";
  const assistantActive =
    props.status === "thinking" ||
    props.status === "searching" ||
    props.status === "speaking";

  const actionClass =
    "rounded-lg px-2.5 py-1.5 text-sm font-medium text-app-muted transition-colors hover:bg-surface-hover hover:text-app disabled:cursor-not-allowed disabled:opacity-40";

  if (!props.isRunning) {
    return (
      <button
        type="button"
        onClick={props.onStart}
        disabled={props.busy || props.disabled}
        aria-label="Start recording"
        className={actionClass}
      >
        {props.disabled ? "Archived" : props.resume ? "Resume" : "Start"}
      </button>
    );
  }

  return (
    <div className="inline-flex min-w-0 items-center gap-0.5">
      <div className="flex min-w-0 items-center gap-2 px-2.5 py-1.5">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-app-muted"
          aria-hidden
        />
        <span className="font-mono text-[12px] tabular-nums text-app-secondary">
          {formatElapsed(props.elapsedMs)}
        </span>
        {liveStatus ? (
          <span
            className="truncate text-sm font-medium text-app-secondary"
            aria-live="polite"
          >
            {liveStatus}
            {showEllipsis ? <span className="orb-ellipsis">…</span> : null}
          </span>
        ) : null}
      </div>

      {assistantActive ? (
        <button
          type="button"
          onClick={props.onStopSpeaking}
          aria-label="Stop Kivo speaking"
          className={actionClass}
        >
          Silence
        </button>
      ) : null}

      <button
        type="button"
        onClick={props.onStop}
        disabled={props.busy}
        aria-label="Stop recording"
        className={actionClass}
      >
        Stop
      </button>
    </div>
  );
}
