"use client";

import type { ReactNode } from "react";

export function PanelHeader(props: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="kivo-conv-panel-head">
      <div className="min-w-0">
        <h2 className="kivo-conv-panel-title">{props.title}</h2>
        {props.subtitle ? (
          <p className="kivo-conv-panel-subtitle">{props.subtitle}</p>
        ) : null}
      </div>
      {props.action}
    </header>
  );
}

export function PanelClose(props: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      className="kivo-conv-panel-close"
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="m4 4 8 8M12 4 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}
