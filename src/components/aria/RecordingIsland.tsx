"use client";

import { formatElapsed } from "@/components/aria/OrbVisualizer";

/**
 * Compact recording control — timer + Start/Stop in the session header's
 * top-right corner. Independent of Voice vs Overview.
 */
export function RecordingIsland(props: {
  isRunning: boolean;
  busy: boolean;
  elapsedMs: number;
  resume: boolean;
  disabled: boolean;
  assistantActive: boolean;
  onStart: () => void;
  onStop: () => void;
  onStopSpeaking: () => void;
}) {
  return (
    <div className="flex items-center rounded-full border border-app-strong bg-app p-0.5 shadow-sm">
      {props.isRunning ? (
        <div className="flex items-center gap-2 pl-2.5 pr-0.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
          <span className="font-mono text-[11px] tabular-nums text-app">
            {formatElapsed(props.elapsedMs)}
          </span>
          {props.assistantActive ? (
            <button
              type="button"
              onClick={props.onStopSpeaking}
              aria-label="Stop Kivo speaking"
              className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-hover px-3 text-[10px] tracking-[0.14em] text-app transition-colors hover:bg-surface"
            >
              <span className="h-2 w-2 rounded-[2px] bg-app-secondary" />
              SILENCE
            </button>
          ) : null}
          <button
            type="button"
            onClick={props.onStop}
            disabled={props.busy}
            aria-label="Stop recording"
            className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[10px] tracking-[0.18em] text-app-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
          >
            <span className="h-2.5 w-2.5 rounded-[2px] bg-red-500" />
            STOP
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={props.onStart}
          disabled={props.busy || props.disabled}
          aria-label="Start recording"
          className="inline-flex h-7 items-center gap-2 rounded-full pl-2.5 pr-3.5 text-[10px] tracking-[0.18em] text-app-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
        >
          <span className="h-2 w-2 rounded-full bg-red-500" />
          {props.disabled ? "ARCHIVED" : props.resume ? "RESUME" : "START"}
        </button>
      )}
    </div>
  );
}
