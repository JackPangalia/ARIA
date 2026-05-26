"use client";

import type { SessionDoc } from "@/lib/sessions/types";
import { getSessionPreviewLine } from "@/lib/sessions/session-preview";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M20 20l-3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
        x="3"
        y="4"
        width="8"
        height="16"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M14 8l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SessionSidebar(props: {
  sessions: SessionDoc[];
  selectedSessionId: string | null;
  onOpenSearch: () => void;
  onSelect: (sessionId: string) => void;
  onCreate: () => void;
  onCollapse?: () => void;
  onClose?: () => void;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-app px-3 py-4">
      <div className="mb-3 flex items-center justify-between px-1">
        {props.onClose ? (
          <button
            type="button"
            onClick={props.onClose}
            className="text-xs font-semibold text-app-muted transition-colors hover:text-app-secondary"
          >
            Close
          </button>
        ) : (
          <span />
        )}

        {props.onCollapse ? (
          <button
            type="button"
            onClick={props.onCollapse}
            aria-label="Collapse sidebar"
            className="rounded-lg p-2 text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary"
          >
            <CollapseIcon />
          </button>
        ) : null}
      </div>

      <div className="space-y-1 px-1">
        <button
          type="button"
          onClick={props.onOpenSearch}
          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-semibold text-app-secondary transition-colors hover:bg-surface-hover"
        >
          <SearchIcon className="shrink-0 text-app-muted" />
          Search
          <kbd className="ml-auto hidden rounded border border-app px-1.5 py-0.5 text-[10px] font-semibold text-app-subtle lg:inline">
            ⌘K
          </kbd>
        </button>

        <button
          type="button"
          onClick={props.onCreate}
          className="flex w-full items-center gap-3 rounded-xl bg-surface px-2.5 py-2.5 text-sm font-semibold text-app transition-colors hover:bg-surface-hover"
        >
          <PlusIcon className="shrink-0 text-app-muted" />
          New session
        </button>
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-1">
        <p className="mb-2 px-2.5 text-xs font-semibold text-app-muted">History</p>

        {props.sessions.length === 0 ? (
          <p className="px-2.5 py-4 text-sm font-medium text-app-subtle">
            No sessions yet.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {props.sessions.map((session) => {
              const selected = session.id === props.selectedSessionId;
              const muted = session.status !== "active";
              const preview = getSessionPreviewLine(session);

              return (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => props.onSelect(session.id)}
                    className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
                      selected
                        ? "bg-surface-selected text-app"
                        : muted
                          ? "text-app-muted hover:bg-surface-hover hover:text-app-secondary"
                          : "text-app-secondary hover:bg-surface-hover hover:text-app"
                    }`}
                    title={preview ? `${session.title} — ${preview}` : session.title}
                  >
                    <span className="block truncate text-sm font-semibold">
                      {session.title}
                    </span>
                    {preview ? (
                      <span className="mt-0.5 block truncate text-xs font-medium text-app-subtle">
                        {preview}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

function ExpandIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <rect
        x="3"
        y="4"
        width="8"
        height="16"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M13 8h5M13 12h5M13 16h5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SidebarExpandButton(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label="Expand sidebar"
      className="rounded-lg p-2 text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary"
    >
      <ExpandIcon />
    </button>
  );
}
