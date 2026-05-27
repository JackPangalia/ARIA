"use client";

import { useEffect, useRef, useState } from "react";
import { SidebarProfileFooter } from "@/components/sessions/SidebarProfileFooter";
import type { SessionDoc } from "@/lib/sessions/types";

function AriaMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 16L16 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ComposeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronLeftDouble({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11 17l-5-5 5-5M18 17l-5-5 5-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoreVerticalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="5" r="1.75" fill="currentColor" />
      <circle cx="12" cy="12" r="1.75" fill="currentColor" />
      <circle cx="12" cy="19" r="1.75" fill="currentColor" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 17v5M8 3h8l1 7 4 2v2H3v-2l4-2 1-7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SessionHistoryMenu(props: {
  session: SessionDoc;
  onRename: () => void;
  onTogglePin: () => void;
  onExportMarkdown?: (sessionId: string) => void;
  onExportJson?: (sessionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-normal text-app-secondary transition-colors hover:bg-surface-hover hover:text-app";

  return (
    <div
      ref={rootRef}
      className="relative shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[open=true]:opacity-100"
      data-open={open}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Session options"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex items-center justify-center rounded-md p-1 text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary"
      >
        <MoreVerticalIcon />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl bg-menu py-1 shadow-menu ring-1 ring-menu">
          <button type="button" className={itemClass} onClick={() => { props.onRename(); setOpen(false); }}>
            Rename
          </button>
          <button type="button" className={itemClass} onClick={() => { props.onTogglePin(); setOpen(false); }}>
            <PinIcon className="shrink-0 text-app-muted" />
            {props.session.pinned ? "Unpin" : "Pin"}
          </button>
          <div className="my-1 border-t border-app/50" />
          <button type="button" className={itemClass} onClick={() => { props.onExportMarkdown?.(props.session.id); setOpen(false); }}>
            Export Markdown
          </button>
          <button type="button" className={itemClass} onClick={() => { props.onExportJson?.(props.session.id); setOpen(false); }}>
            Export JSON
          </button>
        </div>
      ) : null}
    </div>
  );
}

const navRowClass =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-normal text-app-secondary transition-colors hover:bg-surface-hover hover:text-app";

export function SessionSidebar(props: {
  sessions: SessionDoc[];
  selectedSessionId: string | null;
  onOpenSearch: () => void;
  onSelect: (sessionId: string) => void;
  onCreate: () => void;
  onRename: (sessionId: string, title: string) => void;
  onTogglePin: (sessionId: string, pinned: boolean) => void;
  onCollapse?: () => void;
  onClose?: () => void;
  onExportMarkdown?: (sessionId: string) => void;
  onExportJson?: (sessionId: string) => void;
  onOpenSettings: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const startRename = (session: SessionDoc) => {
    setRenamingId(session.id);
    setRenameDraft(session.title);
  };

  const commitRename = (sessionId: string) => {
    const next = renameDraft.trim();
    setRenamingId(null);
    if (!next) return;
    const session = props.sessions.find((s) => s.id === sessionId);
    if (session && next !== session.title) props.onRename(sessionId, next);
  };

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-app">
      <header className="flex shrink-0 items-center justify-between px-3 pb-2 pt-3">
        {props.onClose ? (
          <button
            type="button"
            onClick={props.onClose}
            className="text-sm font-normal text-app-muted hover:text-app"
          >
            Close
          </button>
        ) : (
          <span className="text-app" aria-label="ARIA">
            <AriaMark />
          </span>
        )}
        {props.onCollapse ? (
          <button
            type="button"
            onClick={props.onCollapse}
            aria-label="Collapse sidebar"
            className="rounded-md p-1.5 text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary"
          >
            <ChevronLeftDouble />
          </button>
        ) : null}
      </header>

      <div className="shrink-0 space-y-0.5 px-2 pb-2">
        <button type="button" onClick={props.onOpenSearch} className={navRowClass}>
          <SearchIcon className="shrink-0 text-app-muted" />
          <span>Search</span>
          <kbd className="ml-auto hidden rounded border border-app/60 bg-app px-1.5 py-0.5 text-[10px] font-normal text-app-subtle lg:inline">
            ⌘K
          </kbd>
        </button>

        <button
          type="button"
          onClick={props.onCreate}
          className="flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-sm font-normal text-app transition-colors hover:bg-surface-hover"
        >
          <ComposeIcon className="shrink-0 text-app-muted" />
          New session
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-normal text-app-muted transition-colors hover:text-app-secondary"
        >
          <ChevronDown
            className={`shrink-0 transition-transform ${historyOpen ? "" : "-rotate-90"}`}
          />
          History
        </button>

        {historyOpen ? (
          props.sessions.length === 0 ? (
            <p className="px-3 py-3 text-sm font-normal text-app-subtle">No sessions yet.</p>
          ) : (
            <ul className="mt-0.5 space-y-0.5">
              {props.sessions.map((session) => {
                const selected = session.id === props.selectedSessionId;
                const muted = session.status !== "active";
                const isRenaming = renamingId === session.id;

                return (
                  <li key={session.id}>
                    <div
                      className={`group relative flex w-full items-center rounded-lg pr-0.5 ${
                        selected
                          ? "bg-surface-hover text-app"
                          : muted
                            ? "text-app-muted"
                            : "text-app-secondary"
                      }`}
                    >
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={() => commitRename(session.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitRename(session.id);
                            }
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          className="mx-2 my-1 flex-1 rounded-md border border-app/50 bg-app px-2 py-1.5 text-sm text-app outline-none"
                          aria-label="Rename session"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => props.onSelect(session.id)}
                          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-lg px-3 py-2 text-left text-sm font-normal transition-colors hover:bg-surface-hover"
                          title={session.title}
                        >
                          {session.pinned ? (
                            <PinIcon className="shrink-0 text-app-subtle" />
                          ) : null}
                          <span className="truncate">{session.title}</span>
                        </button>
                      )}
                      {!isRenaming ? (
                        <SessionHistoryMenu
                          session={session}
                          onRename={() => startRename(session)}
                          onTogglePin={() =>
                            props.onTogglePin(session.id, !session.pinned)
                          }
                          onExportMarkdown={props.onExportMarkdown}
                          onExportJson={props.onExportJson}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </div>

      <SidebarProfileFooter onOpenSettings={props.onOpenSettings} />
    </aside>
  );
}

function ExpandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="8" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M13 8h5M13 12h5M13 16h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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
