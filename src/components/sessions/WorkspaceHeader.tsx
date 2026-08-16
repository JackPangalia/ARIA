"use client";

import type { ReactNode } from "react";

export function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The Kivo wordmark, and the way back to the home hub from anywhere.
 * Uses `.kivo-wordmark` — same uppercase / tracking as the landing nav.
 */
export function KivoMark(props: { onClick?: () => void; dimmed?: boolean }) {
  if (!props.onClick) {
    return (
      <span className="kivo-wordmark shrink-0 select-none text-[11px] text-app-muted">
        Kivo
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label="Return to Kivo home"
      className={`kivo-wordmark shrink-0 select-none rounded-lg text-[11px] text-app-muted transition-colors hover:text-app focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app ${
        props.dimmed ? "opacity-0 focus-visible:opacity-100" : ""
      }`}
    >
      Kivo
    </button>
  );
}

export function BreadcrumbSeparator() {
  return (
    <span aria-hidden className="shrink-0 text-[13px] text-app-subtle">
      /
    </span>
  );
}

/**
 * The current surface's crumb — plain text for static titles, or a wrapper for
 * an interactive title such as the editable session name.
 */
export function BreadcrumbCrumb(props: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {props.icon ? <span className="shrink-0 text-app-muted">{props.icon}</span> : null}
      <span className="min-w-0 truncate text-[13px] font-medium text-app">
        {props.children}
      </span>
    </span>
  );
}

/**
 * The one header every workspace surface renders, so the title always sits in
 * the same place and the actions always sit opposite it.
 *
 * It must stay a `.kivo-session-topbar`: on desktop that class carries the
 * macOS hiddenInset titlebar offset (traffic lights) and the window drag
 * region, and `.kivo-voice-stage` offsets the orb by this bar's height to
 * optically centre it. A surface that skips this header loses all three.
 */
export function WorkspaceHeader(props: { breadcrumb: ReactNode; actions?: ReactNode }) {
  return (
    <header className="kivo-session-topbar pointer-events-auto z-10 flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-3 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{props.breadcrumb}</div>
      {props.actions ? (
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">{props.actions}</div>
      ) : null}
    </header>
  );
}

export function HeaderIconButton(props: {
  onClick: () => void;
  label: string;
  expanded?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      aria-expanded={props.expanded}
      className="rounded-lg p-1.5 text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary"
    >
      {props.children}
    </button>
  );
}

export function HeaderPrimaryButton(props: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}
