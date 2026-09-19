"use client";

import { useMemo, useState } from "react";
import type { SessionDoc } from "@/lib/sessions/types";
import { homeGreeting } from "@/lib/home";
import { ChevronRightIcon, HubEmptyState, PlusIcon, SearchIcon, SessionIcon } from "./icons";
import { sessionPrefetchProps } from "@/lib/sessions/detail-cache";
import { Spinner } from "./Loaders";
import { useEducationAnchor } from "@/components/education/EducationProvider";
import "./session-hub.css";

const RECENT_LIMIT = 8;

function formatDate(value: string | number) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function ArrowIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Home: start listening, find a past conversation, or pick one up.
 * Projects and settings stay in the sidebar.
 */
export function SessionHub(props: {
  displayName?: string | null;
  sessions: SessionDoc[];
  onNewConversation: () => void;
  primaryBusy?: boolean;
  onOpenSearch: () => void;
  onSelectSession: (sessionId: string) => void;
}) {
  const [hour] = useState(() => new Date().getHours());
  const educationAnchor = useEducationAnchor<HTMLButtonElement>("start");

  const recentSessions = useMemo(
    () =>
      [...props.sessions]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, RECENT_LIMIT),
    [props.sessions],
  );

  return (
    <main className="kivo-home-scroll pointer-events-auto h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain" id="main-content">
      <div className="kivo-home-canvas kivo-home-canvas--plain mx-auto w-full">
        <section className="kivo-home-intro" aria-labelledby="home-title">
          <h1 id="home-title" className="kivo-home-title">
            {homeGreeting(hour, props.displayName)}
          </h1>
          <div className="kivo-home-actions">
            <button
              ref={educationAnchor}
              type="button"
              onClick={props.onNewConversation}
              disabled={props.primaryBusy}
              aria-busy={props.primaryBusy || undefined}
              className="kivo-home-primary"
            >
              {props.primaryBusy ? <Spinner /> : <PlusIcon size={16} />}
              New conversation
            </button>
            <button
              type="button"
              onClick={props.onOpenSearch}
              className="kivo-home-search group flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-app-muted transition-[background-color,border-color] duration-200 hover:border-app hover:bg-surface-hover hover:text-app-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app"
            >
              <SearchIcon className="shrink-0 transition-colors group-hover:text-app" />
              <span className="min-w-0 flex-1 truncate">Search conversations</span>
              <kbd className="hidden rounded-md bg-[color-mix(in_srgb,var(--app-bg)_60%,transparent)] px-2 py-0.5 font-mono text-[10px] text-app-subtle sm:inline">⌘K</kbd>
            </button>
          </div>
        </section>

        <section aria-labelledby="home-recent-heading" className="kivo-home-section kivo-home-panel mt-5 min-w-0">
          <div className="kivo-home-panel-heading">
            <h2 id="home-recent-heading" className="kivo-home-panel-title">
              Recent
            </h2>
            {props.sessions.length > RECENT_LIMIT ? (
              <button type="button" onClick={props.onOpenSearch} className="kivo-home-view-all">
                View all <ArrowIcon />
              </button>
            ) : null}
          </div>

          {recentSessions.length ? (
            <ul className="kivo-home-session-list kivo-stagger mt-3 divide-y divide-[color-mix(in_srgb,var(--app-border-subtle)_65%,transparent)]">
              {recentSessions.map((session) => {
                const inProgress = session.status === "active" && session.turnCount > 0;
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => props.onSelectSession(session.id)}
                      {...sessionPrefetchProps(session.id)}
                      className="kivo-home-session-row group flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-[background-color,transform] duration-200 hover:bg-[color-mix(in_srgb,var(--app-surface-hover)_70%,transparent)] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-app"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-app-muted transition-colors group-hover:bg-surface group-hover:text-app">
                        <SessionIcon size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-app">{session.title}</span>
                        <span className="mt-1 flex items-center gap-1.5 text-xs text-app-muted">
                          {inProgress ? <span className="kivo-home-live-dot" aria-hidden /> : null}
                          <span className="truncate">{inProgress ? "In progress" : "Conversation"}</span>
                        </span>
                      </span>
                      <time
                        className="shrink-0 text-xs tabular-nums text-app-subtle"
                        dateTime={new Date(session.updatedAt).toISOString()}
                      >
                        {formatDate(session.updatedAt)}
                      </time>
                      <ChevronRightIcon className="-ml-1 shrink-0 text-app-subtle opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <HubEmptyState
              icon={<SessionIcon size={20} />}
              title="No conversations yet"
              description="Start listening and the room can ask Kivo out loud."
              action={
                <button
                  type="button"
                  onClick={props.onNewConversation}
                  disabled={props.primaryBusy}
                  className="disabled:opacity-50 text-sm font-medium text-app underline decoration-[var(--app-border-strong)] underline-offset-4 hover:decoration-[var(--app-fg)]"
                >
                  New conversation
                </button>
              }
            />
          )}
        </section>
      </div>
    </main>
  );
}
