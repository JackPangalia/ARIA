"use client";

import {
  formatElapsed,
  modeFor,
  statusLabelFor,
} from "@/components/aria/visual-state";
import { Spinner } from "@/components/sessions/Loaders";
import { StopIcon } from "@/components/sessions/icons";
import { useEducationAnchor } from "@/components/education/EducationProvider";
import { useAriaStore } from "@/lib/store";
import type { AriaStatus } from "@/lib/types";

const METER_BARS = [0.15, 0.35, 0.6, 0.35, 0.15];

/** Five thin bars driven by the mic envelope — activity, not a waveform. */
function MicMeter({ level, live }: { level: number; live: boolean }) {
  return (
    <span className="kivo-conv-meter" aria-hidden data-live={live ? "true" : "false"}>
      {METER_BARS.map((weight, index) => {
        const height = live ? Math.min(1, 0.18 + level * (0.6 + weight)) : 0.18;
        return (
          <span
            key={index}
            className="kivo-conv-meter-bar"
            style={{ transform: `scaleY(${height.toFixed(3)})` }}
          />
        );
      })}
    </span>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ConversationBar(props: {
  status: AriaStatus;
  isRunning: boolean;
  busy: boolean;
  elapsedMs: number;
  archived: boolean;
  resume: boolean;
  canSilence: boolean;
  notice: string | null;
  onStart: () => void;
  onStop: () => void;
  onStopSpeaking: () => void;
}) {
  const micLevel = useAriaStore((state) => state.micLevel);
  const mode = modeFor(props.status);
  const startAnchor = useEducationAnchor<HTMLButtonElement>("start");
  const voiceAnchor = useEducationAnchor<HTMLDivElement>("voice");

  if (!props.isRunning) {
    const label = props.busy
      ? props.resume
        ? "Wrapping up…"
        : "Starting…"
      : props.archived
        ? "Archived"
        : props.resume
          ? "Resume listening"
          : "Start listening";
    return (
      <footer className="kivo-conv-bar" aria-label="Listening controls">
        <div className="kivo-conv-bar-status">
          <span className="kivo-conv-orb" data-mode="idle" aria-hidden />
          <span className="kivo-conv-bar-label">
            {props.busy && props.resume ? "Writing your notes" : "Not listening"}
          </span>
          <span className="kivo-conv-bar-hint">
            {props.archived
              ? "This conversation is archived."
              : "Kivo transcribes the room and answers out loud when someone says “Hey Kivo”."}
          </span>
        </div>
        <button
          ref={startAnchor}
          type="button"
          onClick={props.onStart}
          disabled={props.busy || props.archived}
          className="kivo-conv-start"
        >
          {props.busy ? <Spinner /> : <MicIcon />}
          <span>{label}</span>
        </button>
      </footer>
    );
  }

  const hint =
    props.notice ??
    (mode === "listen"
      ? "Say “Hey Kivo” to ask something"
      : mode === "followup"
        ? "Keep talking — no wake word needed"
        : mode === "wake"
          ? "Listening for your question"
          : null);

  return (
    <footer className="kivo-conv-bar is-live" aria-label="Live conversation controls">
      <div ref={voiceAnchor} className="kivo-conv-bar-status" aria-live="polite">
        <MicMeter level={micLevel} live={mode !== "idle"} />
        <span className="kivo-conv-elapsed">{formatElapsed(props.elapsedMs)}</span>
        <span className="kivo-conv-orb" data-mode={mode} aria-hidden />
        <span className="kivo-conv-bar-label" key={props.status}>
          {statusLabelFor(props.status)}
          {mode === "think" || mode === "search" ? <span className="orb-ellipsis">…</span> : null}
        </span>
        {hint ? <span className="kivo-conv-bar-hint">{hint}</span> : null}
      </div>
      <div className="kivo-conv-bar-actions">
        {props.canSilence ? (
          <button
            type="button"
            onClick={props.onStopSpeaking}
            className="kivo-conv-silence"
            aria-label="Stop Kivo's answer"
          >
            Stop answer
          </button>
        ) : null}
        <button
          type="button"
          onClick={props.onStop}
          disabled={props.busy}
          className="kivo-conv-end"
          aria-label="End conversation"
        >
          {props.busy ? <Spinner /> : <StopIcon size={15} />}
          <span>End conversation</span>
        </button>
      </div>
    </footer>
  );
}
