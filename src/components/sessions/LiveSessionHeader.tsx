"use client";

import { EditableSessionTitle } from "@/components/aria/EditableSessionTitle";
import { StopIcon } from "./icons";
import "./live-session-header.css";

export function LiveSessionHeader(props: {
  title: string;
  onRenameTitle: (title: string) => void;
  onStop: () => void;
  busy: boolean;
  canSilence: boolean;
  onSilence: () => void;
}) {
  return (
    <header className="kivo-live-session-header" aria-label="Live conversation">
      <div className="kivo-live-session-title">
        <EditableSessionTitle title={props.title} onRenameTitle={props.onRenameTitle} />
      </div>
      <div className="kivo-live-session-actions">
        {props.canSilence ? (
          <button
            type="button"
            onClick={props.onSilence}
            aria-label="Stop Kivo speaking"
            className="kivo-session-silence"
          >
            Silence
          </button>
        ) : null}
        <button
          type="button"
          onClick={props.onStop}
          disabled={props.busy}
          aria-label="Stop recording"
          className="kivo-session-stop"
        >
          <StopIcon size={16} />
          <span>Stop</span>
        </button>
      </div>
    </header>
  );
}
