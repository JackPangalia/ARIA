"use client";

import { useEffect, useRef } from "react";
import type { SessionDoc } from "@/lib/sessions/types";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
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

export function SessionSearchModal(props: {
  open: boolean;
  query: string;
  sessions: SessionDoc[];
  selectedSessionId: string | null;
  onQueryChange: (value: string) => void;
  onSelect: (sessionId: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { open, onClose } = props;

  useEffect(() => {
    if (!open) return;

    inputRef.current?.focus();
    inputRef.current?.select();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 bg-overlay backdrop-blur-[2px]"
        onClick={props.onClose}
      />

      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-app bg-menu shadow-menu">
        <div className="flex items-center gap-3 border-b border-app px-4 py-3.5">
          <SearchIcon className="shrink-0 text-app-muted" />
          <input
            ref={inputRef}
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Search sessions..."
            className="w-full bg-transparent text-base font-medium text-app outline-none placeholder:text-app-subtle"
          />
          <kbd className="hidden rounded-md border border-app px-1.5 py-0.5 text-[10px] font-semibold text-app-subtle sm:inline">
            Esc
          </kbd>
        </div>

        <div className="max-h-[min(24rem,calc(100vh-16rem))] overflow-y-auto p-2">
          {props.sessions.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm font-medium text-app-muted">
              {props.query.trim()
                ? "No sessions match your search."
                : "No sessions yet."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {props.sessions.map((session) => {
                const selected = session.id === props.selectedSessionId;
                const muted = session.status !== "active";

                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => {
                        props.onSelect(session.id);
                        props.onClose();
                      }}
                      className={`w-full rounded-xl px-3 py-3 text-left transition-colors ${
                        selected
                          ? "bg-surface-selected text-app"
                          : muted
                            ? "text-app-muted hover:bg-surface-hover hover:text-app-secondary"
                            : "text-app-secondary hover:bg-surface-hover hover:text-app"
                      }`}
                    >
                      <span className="block truncate text-sm font-semibold">
                        {session.title}
                      </span>
                      <span className="mt-1 block text-xs font-medium text-app-subtle">
                        {session.status === "active"
                          ? "Active"
                          : session.status === "ended"
                            ? "Ended"
                            : "Archived"}
                        {" · "}
                        {new Date(session.updatedAt).toLocaleString()}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
