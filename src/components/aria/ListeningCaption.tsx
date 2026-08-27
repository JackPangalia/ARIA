"use client";

import {
  formatElapsed,
  modeFor,
  statusLabelFor,
} from "@/components/aria/visual-state";
import type { AriaStatus } from "@/lib/types";
import { useEducationAnchor } from "@/components/education/EducationProvider";

/** Quiet live status under the orb — typesetting, not a control. */
export function ListeningCaption(props: {
  status: AriaStatus;
  elapsedMs: number;
}) {
  const mode = modeFor(props.status);
  const educationAnchor = useEducationAnchor<HTMLParagraphElement>("voice");
  // Always the real state. This used to print "Listening" for idle, which read
  // as passive listening at the one moment the session was not listening at all.
  const label = statusLabelFor(props.status);
  const showEllipsis = mode === "think" || mode === "search";

  return (
    <p ref={educationAnchor} className="kivo-listening-caption" aria-live="polite">
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
