"use client";

import type { SessionDoc, SessionSummaryDoc } from "@/lib/sessions/types";
import { getSessionSummaryText } from "@/lib/sessions/session-preview";

function CollapseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <rect
        x="13"
        y="4"
        width="8"
        height="16"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M10 8L6 12l4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SessionInsightsPanel(props: {
  session: SessionDoc;
  summary: SessionSummaryDoc | null;
  onClose: () => void;
}) {
  const summaryText = getSessionSummaryText(props.summary, props.session);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-app px-3 py-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <span />
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Collapse summary"
          className="rounded-lg p-2 text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary"
        >
          <CollapseIcon />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        <p className="mb-2 px-2.5 text-xs font-semibold text-app-muted">Summary</p>

        <div className="px-2.5 py-2">
          <p className="text-sm font-medium leading-relaxed text-app-secondary whitespace-pre-wrap">
            {summaryText}
          </p>
        </div>
      </div>
    </aside>
  );
}
