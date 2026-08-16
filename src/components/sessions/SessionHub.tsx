"use client";

import { useMemo, useState } from "react";
import type { ProjectDoc } from "@/lib/projects/types";
import type { SessionDoc } from "@/lib/sessions/types";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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

function SessionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 10v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 7v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13 9v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M17 5v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M21 11v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m9 18 6-6-6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatDate(value: string | number) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type HubTab = "all" | "sessions" | "projects";

const PAGE_SIZE = 15;

export function SessionHub(props: {
  projects: ProjectDoc[];
  sessions: SessionDoc[];
  onOpenSearch: () => void;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onSelectSession: (sessionId: string) => void;
}) {
  const [tab, setTab] = useState<HubTab>("all");
  const [visibleSessionsCount, setVisibleSessionsCount] = useState(PAGE_SIZE);
  const [visibleProjectsCount, setVisibleProjectsCount] = useState(PAGE_SIZE);

  const projectSessionCount = (projectId: string) =>
    props.sessions.filter((session) => session.projectId === projectId).length;

  const sortedSessions = useMemo(
    () =>
      [...props.sessions].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [props.sessions]
  );

  const paginatedSessions = useMemo(
    () => sortedSessions.slice(0, visibleSessionsCount),
    [sortedSessions, visibleSessionsCount]
  );

  const paginatedProjects = useMemo(
    () => props.projects.slice(0, visibleProjectsCount),
    [props.projects, visibleProjectsCount]
  );

  const recentSessions = useMemo(() => sortedSessions.slice(0, 8), [sortedSessions]);

  const tabClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
      active
        ? "bg-surface text-app"
        : "text-app-muted hover:bg-surface-hover hover:text-app-secondary"
    }`;

  return (
    <div className="pointer-events-auto mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-24 pt-6 sm:px-10 sm:pb-28 sm:pt-8">
        <div>
          <div>
            <button
              type="button"
              onClick={props.onOpenSearch}
              className="group flex w-full items-center gap-2.5 rounded-2xl bg-surface/60 px-3.5 py-2.5 text-left text-sm text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app"
            >
              <SearchIcon className="shrink-0 text-app-muted transition-colors group-hover:text-app-secondary" />
              <span className="flex-1 text-sm font-normal">Search conversations & projects...</span>
              <kbd className="hidden rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-app-subtle sm:inline">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="mt-6 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={tabClass(tab === "all")}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setTab("sessions")}
              className={tabClass(tab === "sessions")}
            >
              Conversations ({sortedSessions.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("projects")}
              className={tabClass(tab === "projects")}
            >
              Projects ({props.projects.length})
            </button>
          </div>

          {tab === "all" ? (
            <div className="mt-5 space-y-7">
              {/* Projects Section */}
              <section aria-labelledby="home-projects-heading">
                <div className="flex items-center justify-between px-1">
                  <h2 id="home-projects-heading" className="text-xs font-medium uppercase tracking-wider text-app-subtle">
                    Projects ({props.projects.length})
                  </h2>
                  <button
                    type="button"
                    onClick={props.onCreateProject}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-app-muted transition-colors hover:bg-surface-hover hover:text-app"
                  >
                    <PlusIcon className="shrink-0" />
                    <span>New project</span>
                  </button>
                </div>

                {props.projects.length ? (
                  <ul className="mt-2 space-y-0.5">
                    {props.projects.slice(0, 6).map((project) => {
                      const count = projectSessionCount(project.id);
                      return (
                        <li key={project.id}>
                          <button
                            type="button"
                            onClick={() => props.onSelectProject(project.id)}
                            className="group flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-app"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <FolderIcon className="shrink-0 text-app-muted transition-colors group-hover:text-app" />
                              <span className="truncate text-sm text-app">{project.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-app-subtle">
                              <span>{count} {count === 1 ? "conversation" : "conversations"}</span>
                              <ChevronRightIcon className="shrink-0 text-app-subtle transition-colors group-hover:text-app-muted" />
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 px-3 py-3 text-sm font-normal text-app-subtle">
                    Projects keep your conversations and source material organized.
                  </p>
                )}

                {props.projects.length > 6 ? (
                  <button
                    type="button"
                    onClick={() => setTab("projects")}
                    className="mt-2 text-xs font-medium text-app-muted transition-colors hover:text-app px-3 py-1"
                  >
                    View all {props.projects.length} projects →
                  </button>
                ) : null}
              </section>

              {/* Recent Conversations Section */}
              <section aria-labelledby="home-recent-conversations-heading">
                <div className="flex items-center justify-between px-1">
                  <h2 id="home-recent-conversations-heading" className="text-xs font-medium uppercase tracking-wider text-app-subtle">
                    Recent conversations ({sortedSessions.length})
                  </h2>
                  {sortedSessions.length > recentSessions.length ? (
                    <button
                      type="button"
                      onClick={() => setTab("sessions")}
                      className="rounded-lg px-2 py-1 text-xs text-app-muted transition-colors hover:bg-surface-hover hover:text-app"
                    >
                      View all
                    </button>
                  ) : null}
                </div>

                {recentSessions.length ? (
                  <ul className="mt-2 space-y-0.5">
                    {recentSessions.map((session) => (
                      <li key={session.id}>
                        <button
                          type="button"
                          onClick={() => props.onSelectSession(session.id)}
                          className="group flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-app"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <SessionIcon className="shrink-0 text-app-muted transition-colors group-hover:text-app" />
                            <span className="truncate text-sm text-app">{session.title}</span>
                          </div>
                          <time className="shrink-0 text-xs text-app-subtle" dateTime={new Date(session.updatedAt).toISOString()}>
                            {formatDate(session.updatedAt)}
                          </time>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 px-3 py-3 text-sm font-normal text-app-subtle">
                    Your completed conversations will appear here.
                  </p>
                )}

                {sortedSessions.length > recentSessions.length ? (
                  <button
                    type="button"
                    onClick={() => setTab("sessions")}
                    className="mt-2 text-xs font-medium text-app-muted transition-colors hover:text-app px-3 py-1"
                  >
                    View all {sortedSessions.length} conversations →
                  </button>
                ) : null}
              </section>
            </div>
          ) : null}

          {tab === "sessions" ? (
            <div className="mt-5">
              {sortedSessions.length === 0 ? (
                <p className="px-3 py-3 text-sm font-normal text-app-subtle">
                  No conversations yet.
                </p>
              ) : (
                <div className="space-y-3">
                  <ul className="space-y-0.5">
                    {paginatedSessions.map((session) => (
                      <li key={session.id}>
                        <button
                          type="button"
                          onClick={() => props.onSelectSession(session.id)}
                          className="group flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-app"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <SessionIcon className="shrink-0 text-app-muted transition-colors group-hover:text-app" />
                            <span className="truncate text-sm text-app">{session.title}</span>
                          </div>
                          <time className="shrink-0 text-xs text-app-subtle" dateTime={new Date(session.updatedAt).toISOString()}>
                            {formatDate(session.updatedAt)}
                          </time>
                        </button>
                      </li>
                    ))}
                  </ul>

                  {sortedSessions.length > paginatedSessions.length ? (
                    <div className="flex items-center justify-between px-1 pb-2 pt-3">
                      <span className="text-xs text-app-subtle">
                        Showing {paginatedSessions.length} of {sortedSessions.length} conversations
                      </span>
                      <button
                        type="button"
                        onClick={() => setVisibleSessionsCount((prev) => prev + PAGE_SIZE)}
                        className="rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-app-secondary transition-colors hover:bg-surface-hover hover:text-app"
                      >
                        Load more
                      </button>
                    </div>
                  ) : sortedSessions.length > PAGE_SIZE ? (
                    <p className="pt-2 text-center text-xs text-app-subtle">
                      Showing all {sortedSessions.length} conversations
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {tab === "projects" ? (
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium uppercase tracking-wider text-app-subtle">
                  All Projects ({props.projects.length})
                </span>
                <button
                  type="button"
                  onClick={props.onCreateProject}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-app-muted transition-colors hover:bg-surface-hover hover:text-app"
                >
                  <PlusIcon className="shrink-0" />
                  <span>New project</span>
                </button>
              </div>

              {props.projects.length === 0 ? (
                <p className="px-3 py-3 text-sm font-normal text-app-subtle">
                  No projects created yet.
                </p>
              ) : (
                <div className="space-y-3">
                  <ul className="space-y-0.5">
                    {paginatedProjects.map((project) => {
                      const count = projectSessionCount(project.id);
                      return (
                        <li key={project.id}>
                          <button
                            type="button"
                            onClick={() => props.onSelectProject(project.id)}
                            className="group flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-app"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <FolderIcon className="shrink-0 text-app-muted transition-colors group-hover:text-app" />
                              <span className="truncate text-sm text-app">{project.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-app-subtle">
                              <span>{count} {count === 1 ? "conversation" : "conversations"}</span>
                              <ChevronRightIcon className="shrink-0 text-app-subtle transition-colors group-hover:text-app-muted" />
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  {props.projects.length > paginatedProjects.length ? (
                    <div className="flex items-center justify-between px-1 pb-2 pt-3">
                      <span className="text-xs text-app-subtle">
                        Showing {paginatedProjects.length} of {props.projects.length} projects
                      </span>
                      <button
                        type="button"
                        onClick={() => setVisibleProjectsCount((prev) => prev + PAGE_SIZE)}
                        className="rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-app-secondary transition-colors hover:bg-surface-hover hover:text-app"
                      >
                        Load more
                      </button>
                    </div>
                  ) : props.projects.length > PAGE_SIZE ? (
                    <p className="pt-2 text-center text-xs text-app-subtle">
                      Showing all {props.projects.length} projects
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
