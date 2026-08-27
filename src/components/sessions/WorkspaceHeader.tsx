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
 * The current surface's crumb — plain text for static titles, or a wrapper for
 * an interactive title such as the editable session name.
 */
export function BreadcrumbCrumb(props: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {props.icon ? <span className="shrink-0 text-app-muted">{props.icon}</span> : null}
      <span className="min-w-0 truncate text-[15px] font-medium tracking-[-0.01em] text-app">
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
export function WorkspaceHeader(props: { breadcrumb: ReactNode; actions?: ReactNode; navigation?: ReactNode }) {
  return (
    <header className="kivo-session-topbar pointer-events-auto z-20 flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-3 sm:px-4">
      {props.navigation}
      <div className="kivo-header-breadcrumb flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">{props.breadcrumb}</div>
      {props.actions ? (
        <div className="kivo-header-actions flex shrink-0 items-center gap-1.5 sm:gap-2">{props.actions}</div>
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
      className="kivo-header-icon rounded-lg p-1.5 text-app-muted transition-[background-color,color,transform] hover:bg-surface-hover hover:text-app-secondary active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app"
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
      className="flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-fg transition-[opacity,transform] hover:-translate-y-0.5 hover:opacity-90 active:translate-y-px active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}
