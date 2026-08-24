"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SessionDoc } from "@/lib/sessions/types";
import "./kivo-palette.css";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M20 20l-3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ComposeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
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

function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M5 7l1 14h12l1-14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatSessionDate(value: string | number): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type SessionGroup = { label: string; sessions: SessionDoc[] };

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function groupSessionsByPeriod(sessions: SessionDoc[]): SessionGroup[] {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const buckets = new Map<string, SessionDoc[]>();

  for (const session of sorted) {
    const day = startOfDay(new Date(session.updatedAt));
    let label: string;

    if (day.getTime() >= today.getTime()) {
      label = "Today";
    } else if (day.getTime() >= yesterday.getTime()) {
      label = "Yesterday";
    } else if (day.getTime() >= weekAgo.getTime()) {
      label = "Previous 7 days";
    } else if (day.getTime() >= monthStart.getTime()) {
      label = "This month";
    } else if (day.getTime() >= yearStart.getTime()) {
      label = "This year";
    } else {
      label = "Older";
    }

    const list = buckets.get(label) ?? [];
    list.push(session);
    buckets.set(label, list);
  }

  const order = [
    "Today",
    "Yesterday",
    "Previous 7 days",
    "This month",
    "This year",
    "Older",
  ];

  return order
    .filter((label) => buckets.has(label))
    .map((label) => ({ label, sessions: buckets.get(label)! }));
}

function SessionSearchPanel(props: {
  query: string;
  sessions: SessionDoc[];
  selectedSessionId: string | null;
  onQueryChange: (value: string) => void;
  onSelect: (sessionId: string) => void;
  onCreateNew: () => void;
  onRename: (sessionId: string, title: string) => void;
  onArchive: (sessionId: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onSelectRef = useRef(props.onSelect);
  const onCloseRef = useRef(props.onClose);
  const onRenameRef = useRef(props.onRename);
  const onArchiveRef = useRef(props.onArchive);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  onSelectRef.current = props.onSelect;
  onCloseRef.current = props.onClose;
  onRenameRef.current = props.onRename;
  onArchiveRef.current = props.onArchive;

  const groups = useMemo(
    () => groupSessionsByPeriod(props.sessions),
    [props.sessions]
  );

  const flatSessions = useMemo(
    () => groups.flatMap((group) => group.sessions),
    [groups]
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setFocusedIndex(0);
  }, [props.query, flatSessions.length]);

  const openSession = useCallback((sessionId: string) => {
    onSelectRef.current(sessionId);
    onCloseRef.current();
  }, []);

  const startRename = useCallback((session: SessionDoc) => {
    setRenamingId(session.id);
    setRenameDraft(session.title);
  }, []);

  const commitRename = useCallback(
    (sessionId: string) => {
      const next = renameDraft.trim();
      setRenamingId(null);
      if (!next) return;
      const session = flatSessions.find((s) => s.id === sessionId);
      if (session && next !== session.title) {
        onRenameRef.current(sessionId, next);
      }
    },
    [flatSessions, renameDraft]
  );

  const focusedSession = flatSessions[focusedIndex] ?? null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (renamingId) {
        if (event.key === "Enter") {
          event.preventDefault();
          commitRename(renamingId);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setRenamingId(null);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (document.activeElement === inputRef.current) {
        if (event.key === "ArrowDown" && flatSessions.length > 0) {
          event.preventDefault();
          inputRef.current?.blur();
          setFocusedIndex(0);
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        if (focusedSession) startRename(focusedSession);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        if (focusedSession && focusedSession.status !== "archived") {
          onArchiveRef.current(focusedSession.id);
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, Math.max(flatSessions.length - 1, 0)));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (event.key === "Enter" && focusedSession) {
        event.preventDefault();
        openSession(focusedSession.id);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    commitRename,
    flatSessions.length,
    focusedSession,
    openSession,
    renamingId,
    startRename,
  ]);

  let rowIndex = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search conversations"
      className="kivo-settings-modal-in kivo-palette-modal relative z-10 flex min-h-0 w-full max-w-[38rem] flex-col overflow-hidden rounded-t-[1.5rem] border border-app-subtle bg-menu shadow-menu ring-1 ring-menu sm:rounded-[1.75rem]"
    >
      <div className="kivo-palette-search">
        <SearchIcon className="kivo-palette-search-icon" />
        <input
          ref={inputRef}
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="Search conversations"
          className="kivo-palette-search-input"
          aria-label="Search conversations"
        />
      </div>

      <div className="kivo-palette-body">
        <div className="kivo-palette-section">
          <p className="kivo-palette-section-label">Actions</p>
          <button
            type="button"
            className="kivo-palette-action"
            onClick={() => {
              props.onCreateNew();
              props.onClose();
            }}
          >
            <ComposeIcon className="shrink-0 opacity-80" />
            <span>New conversation</span>
          </button>
        </div>

        {flatSessions.length === 0 ? (
          <p className="kivo-palette-empty">
            {props.query.trim()
              ? "No conversations match your search."
              : "No conversations yet."}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="kivo-palette-section">
              <p className="kivo-palette-section-label">{group.label}</p>
              <ul className="kivo-palette-list">
                {group.sessions.map((session) => {
                  rowIndex += 1;
                  const index = rowIndex;
                  const focused = index === focusedIndex;
                  const selected = session.id === props.selectedSessionId;
                  const hovered = hoverId === session.id;
                  const renaming = renamingId === session.id;

                  return (
                    <li key={session.id}>
                      <div
                        className="kivo-palette-row"
                        data-focused={focused || undefined}
                        data-selected={selected || undefined}
                        onMouseEnter={() => setHoverId(session.id)}
                        onMouseLeave={() =>
                          setHoverId((id) => (id === session.id ? null : id))
                        }
                      >
                        {renaming ? (
                          <input
                            autoFocus
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onBlur={() => commitRename(session.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitRename(session.id);
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                setRenamingId(null);
                              }
                            }}
                            className="kivo-palette-rename-input"
                            onClick={(event) => event.stopPropagation()}
                          />
                        ) : (
                          <button
                            type="button"
                            className="kivo-palette-row-main"
                            onClick={() => openSession(session.id)}
                            onMouseEnter={() => setFocusedIndex(index)}
                          >
                            <span className="truncate">{session.title}</span>
                            <span className="kivo-palette-row-date">
                              {formatSessionDate(session.updatedAt)}
                            </span>
                          </button>
                        )}

                        {!renaming ? (
                          <div
                            className="kivo-palette-row-actions"
                            data-visible={hovered || undefined}
                          >
                            <button
                              type="button"
                              aria-label={`Rename ${session.title}`}
                              className="kivo-palette-icon-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                startRename(session);
                              }}
                            >
                              <PencilIcon />
                            </button>
                            {session.status !== "archived" ? (
                              <button
                                type="button"
                                aria-label={`Archive ${session.title}`}
                                className="kivo-palette-icon-btn kivo-palette-icon-btn-danger"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  props.onArchive(session.id);
                                }}
                              >
                                <ArchiveIcon />
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function SessionSearchModal(props: {
  open: boolean;
  query: string;
  sessions: SessionDoc[];
  selectedSessionId: string | null;
  onQueryChange: (value: string) => void;
  onSelect: (sessionId: string) => void;
  onCreateNew: () => void;
  onRename: (sessionId: string, title: string) => void;
  onArchive: (sessionId: string) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !props.open) {
      return undefined;
    }

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted, props.open]);

  if (!props.open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] isolate flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close search"
        className="kivo-overlay-in absolute inset-0 bg-overlay backdrop-blur-sm"
        onClick={props.onClose}
      />
      <SessionSearchPanel
        query={props.query}
        sessions={props.sessions}
        selectedSessionId={props.selectedSessionId}
        onQueryChange={props.onQueryChange}
        onSelect={props.onSelect}
        onCreateNew={props.onCreateNew}
        onRename={props.onRename}
        onArchive={props.onArchive}
        onClose={props.onClose}
      />
    </div>,
    document.body
  );
}
