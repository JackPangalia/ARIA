"use client";

import {
  formatElapsed,
  modeFor,
  statusLabelFor,
} from "@/components/aria/visual-state";
import type { AriaStatus } from "@/lib/types";

/** Quiet live status under the orb — typesetting, not a control. */
export function ListeningCaption(props: {
  status: AriaStatus;
  elapsedMs: number;
}) {
  const mode = modeFor(props.status);
  const label =
    mode !== "idle" ? statusLabelFor(props.status) : "Listening";
  const showEllipsis = mode === "think" || mode === "search";

  return (
    <p className="kivo-listening-caption" aria-live="polite">
      <span key={label} className="kivo-fade-in">
        {label}
        {showEllipsis ? <span className="orb-ellipsis">…</span> : null}
      </span>
      <span className="kivo-listening-timer">
        {formatElapsed(props.elapsedMs)}
      </span>
    </p>
  );
}
