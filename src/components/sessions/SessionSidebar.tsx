"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SidebarProfileFooter } from "@/components/sessions/SidebarProfileFooter";
import type { SessionDoc } from "@/lib/sessions/types";

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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
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

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MarkdownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8 9l2 4 2-4 2 4 2-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function JsonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 4C5.5 4 4 5.5 4 8v1c0 1.5-.8 2.5-2 3 1.2.5 2 1.5 2 3v1c0 2.5 1.5 4 4 4M16 4c2.5 0 4 1.5 4 4v1c0 1.5.8 2.5 2 3-1.2.5-2 1.5-2 3v1c0 2.5-1.5 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"
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
  onTrash?: (sessionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const menuItemClass =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-normal text-app-secondary transition-colors hover:bg-surface-hover hover:text-app";

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const menuWidth = 200;
    // Use the real rendered height once the menu exists; estimate before that.
    const menuHeight = menuRef.current?.offsetHeight ?? 280;

    const left = Math.min(
      Math.max(margin, rect.right - menuWidth),
      window.innerWidth - menuWidth - margin
    );

    // Prefer opening below the trigger; flip above when it would overflow the
    // bottom of the viewport (the bug on lower session rows).
    const fitsBelow = rect.bottom + menuHeight + margin <= window.innerHeight;
    let top = fitsBelow ? rect.bottom + 6 : rect.top - menuHeight - 6;
    // Never let it run past either edge of the viewport.
    top = Math.min(
      Math.max(margin, top),
      Math.max(margin, window.innerHeight - menuHeight - margin)
    );

    setPosition({ top, left });
  };

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }

    updatePosition();
    setReady(true);

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const onReposition = () => updatePosition();

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const menu =
    open && mounted
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[250] flex max-h-[calc(100dvh-1rem)] w-[12.5rem] flex-col overflow-y-auto rounded-xl border border-app bg-menu p-1.5 shadow-menu"
            style={{
              top: position.top,
              left: position.left,
              opacity: ready ? 1 : 0,
            }}
          >
            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                props.onRename();
                setOpen(false);
              }}
            >
              <PencilIcon className="shrink-0 text-app-muted" />
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                props.onTogglePin();
                setOpen(false);
              }}
            >
              <PinIcon className="shrink-0 text-app-muted" />
              {props.session.pinned ? "Unpin" : "Pin"}
            </button>
            <div className="mx-2 my-1 border-t border-app" role="separator" />
            <p className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-app-subtle">
              Export
            </p>
            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                props.onExportMarkdown?.(props.session.id);
                setOpen(false);
              }}
            >
              <MarkdownIcon className="shrink-0 text-app-muted" />
              Markdown
            </button>
            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                props.onExportJson?.(props.session.id);
                setOpen(false);
              }}
            >
              <JsonIcon className="shrink-0 text-app-muted" />
              JSON
            </button>
            <div className="mx-2 my-1 border-t border-app" role="separator" />
            <button
              type="button"
              role="menuitem"
              className={`${menuItemClass} !text-danger`}
              onClick={() => {
                props.onTrash?.(props.session.id);
                setOpen(false);
              }}
            >
              <TrashIcon className="shrink-0" />
              Move to trash
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Session options"
        aria-expanded={open}
        data-open={open}
        onClick={(e) => {
          e.stopPropagation();
          if (!open) updatePosition();
          setOpen((v) => !v);
        }}
        className="mr-0.5 flex shrink-0 items-center justify-center rounded-lg p-2 text-app-muted opacity-100 transition-[opacity,background-color,color] hover:bg-surface-hover hover:text-app-secondary data-[open=true]:bg-surface-hover data-[open=true]:text-app-secondary data-[open=true]:opacity-100 lg:p-1.5 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
      >
        <MoreVerticalIcon />
      </button>
      {menu}
    </>
  );
}

const navRowClass =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-normal text-app-secondary transition-colors hover:bg-surface-hover hover:text-app";

const sectionToggleClass =
  "flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-normal text-app-muted transition-colors hover:text-app-secondary";

function SessionSectionToggle(props: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" onClick={props.onToggle} className={sectionToggleClass}>
      <ChevronDown
        className={`shrink-0 transition-transform ${props.open ? "" : "-rotate-90"}`}
      />
      {props.label}
    </button>
  );
}

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
  onTrash?: (sessionId: string) => void;
  onOpenSettings: () => void;
}) {
  const [pinsOpen, setPinsOpen] = useState(true);
  const [recentsOpen, setRecentsOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const { pinnedSessions, recentSessions } = useMemo(() => {
    const pinned: SessionDoc[] = [];
    const recents: SessionDoc[] = [];
    for (const session of props.sessions) {
      if (session.pinned) pinned.push(session);
      else recents.push(session);
    }
    return { pinnedSessions: pinned, recentSessions: recents };
  }, [props.sessions]);

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

  const renderSessionRow = (session: SessionDoc) => {
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
              className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-lg px-3 py-2.5 text-left text-sm font-normal transition-colors hover:bg-surface-hover lg:py-2"
              title={session.title}
            >
              <span className="truncate">{session.title}</span>
            </button>
          )}
          {!isRenaming ? (
            <div onClick={(e) => e.stopPropagation()}>
              <SessionHistoryMenu
                session={session}
                onRename={() => startRename(session)}
                onTogglePin={() => props.onTogglePin(session.id, !session.pinned)}
                onExportMarkdown={props.onExportMarkdown}
                onExportJson={props.onExportJson}
                onTrash={props.onTrash}
              />
            </div>
          ) : null}
        </div>
      </li>
    );
  };

  const renderSessionList = (sessions: SessionDoc[], emptyMessage: string) => {
    if (sessions.length === 0) {
      return (
        <p className="px-3 py-2 text-sm font-normal text-app-subtle">{emptyMessage}</p>
      );
    }

    return <ul className="mt-0.5 space-y-0.5">{sessions.map(renderSessionRow)}</ul>;
  };

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-app pl-[env(safe-area-inset-left)]">
      <header className="flex shrink-0 items-center justify-between px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {props.onClose ? (
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close sessions"
            className="-ml-1.5 flex h-10 w-10 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-surface-hover hover:text-app"
          >
            <CloseIcon />
          </button>
        ) : (
          <span
            className="select-none pl-[0.65em] text-[10px] font-normal tracking-[0.65em] text-app-subtle"
            aria-label="Kivo"
          >
            KIVO
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
        <SessionSectionToggle
          label="Pins"
          open={pinsOpen}
          onToggle={() => setPinsOpen((v) => !v)}
        />
        {pinsOpen ? renderSessionList(pinnedSessions, "No pinned sessions.") : null}

        <div className="mt-1">
          <SessionSectionToggle
            label="Recents"
            open={recentsOpen}
            onToggle={() => setRecentsOpen((v) => !v)}
          />
        </div>
        {recentsOpen ? (
          recentSessions.length === 0 && pinnedSessions.length === 0 ? (
            <p className="px-3 py-2 text-sm font-normal text-app-subtle">No sessions yet.</p>
          ) : (
            renderSessionList(recentSessions, "No recent sessions.")
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
