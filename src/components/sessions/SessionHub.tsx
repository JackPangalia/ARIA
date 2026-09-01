"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { ProjectDoc } from "@/lib/projects/types";
import type { SessionDoc } from "@/lib/sessions/types";
import { homeGreeting, homeHeroMode } from "@/lib/home";
import {
  ChevronRightIcon,
  FolderIcon,
  HubEmptyState,
  PlusIcon,
  SearchIcon,
  SessionIcon,
} from "./icons";
import {
  prefetchSessionDetail,
  sessionPrefetchProps,
} from "@/lib/sessions/detail-cache";
import { Spinner } from "./Loaders";
import { useEducationAnchor } from "@/components/education/EducationProvider";
import "./session-hub.css";

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

export function SessionHub(props: {
  displayName?: string | null;
  projects: ProjectDoc[];
  sessions: SessionDoc[];
  activeSession: SessionDoc | null;
  onPrimaryAction: () => void;
  primaryBusy?: boolean;
  onOpenSearch: () => void;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onSelectSession: (sessionId: string) => void;
}) {
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [hour] = useState(() => new Date().getHours());
  const educationAnchor = useEducationAnchor<HTMLButtonElement>("start");

  const sortedSessions = useMemo(
    () =>
      [...props.sessions].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [props.sessions],
  );
  const recentSessions = sortedSessions.slice(0, 5);
  const heroMode = homeHeroMode(props.sessions);

  const projectSessionCount = (projectId: string) =>
    props.sessions.filter((session) => session.projectId === projectId).length;

  return (
    <main className="kivo-home-scroll pointer-events-auto h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain" id="main-content">
      <div className="kivo-home-canvas mx-auto w-full">
        <section
          className="kivo-home-hero group relative isolate overflow-hidden rounded-2xl"
          data-mode={heroMode}
          aria-labelledby="home-hero-title"
        >
          <Image
            src="/landing/kivo-session-afterglow-motion-v1.png"
            alt="A warmly lit meeting room after a conversation"
            fill
            preload
            sizes="(max-width: 1023px) 100vw, (max-width: 1800px) 90vw, 1600px"
            className="kivo-home-hero-image object-cover"
          />
          <div className="kivo-home-hero-scrim absolute inset-0" />
          <div className="kivo-home-hero-copy relative z-10 flex flex-col items-start justify-center text-[#fbf8f0]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
              {homeGreeting(hour, props.displayName)}
            </p>
            <h1 id="home-hero-title" className="kivo-home-hero-title mt-3 max-w-[11em] font-serif font-normal leading-[1.02] tracking-[-0.04em] text-balance">
              {heroMode === "first_use"
                ? "Bring Kivo into the next conversation."
                : "The room is ready when you are."}
            </h1>
            <p className="mt-4 max-w-[28rem] text-sm leading-relaxed text-white/85 sm:text-[15px]">
              {props.activeSession
                ? `Pick up “${props.activeSession.title}” with the context still intact.`
                : "Start listening, ask out loud, and leave with the conversation intact."}
            </p>
            <button
              ref={educationAnchor}
              type="button"
              onClick={props.onPrimaryAction}
              onPointerEnter={
                props.activeSession
                  ? () => prefetchSessionDetail(props.activeSession!.id)
                  : undefined
              }
              disabled={props.primaryBusy}
              aria-busy={props.primaryBusy || undefined}
              className="kivo-home-hero-action mt-7 inline-flex items-center gap-2 rounded-xl bg-[#f8f4ea] px-4 py-2.5 text-sm font-semibold text-[#171713] shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition-[transform,background-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_16px_34px_rgba(0,0,0,0.22)] active:translate-y-px active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-wait disabled:hover:translate-y-0"
            >
              {props.activeSession ? "Resume conversation" : "Start conversation"}
              {props.primaryBusy ? <Spinner className="h-3.5 w-3.5" /> : <ArrowIcon />}
            </button>
          </div>
        </section>

        <button
          type="button"
          onClick={props.onOpenSearch}
          className="kivo-home-search group mt-4 flex min-h-14 w-full items-center gap-3 rounded-xl bg-[color-mix(in_srgb,var(--app-surface)_35%,transparent)] px-4 py-3 text-left text-sm text-app-muted transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px hover:border-app hover:bg-surface-hover hover:text-app-secondary active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app"
        >
          <SearchIcon className="shrink-0 transition-colors group-hover:text-app" />
          <span className="min-w-0 flex-1 truncate">Search conversations</span>
          <kbd className="hidden rounded-md bg-[color-mix(in_srgb,var(--app-bg)_60%,transparent)] px-2 py-0.5 font-mono text-[10px] text-app-subtle sm:inline">⌘K</kbd>
        </button>

        <div className="kivo-home-sections mt-4 grid items-start gap-4">
          <section aria-labelledby="home-recent-heading" className="kivo-home-section kivo-home-panel min-w-0">
            <div className="kivo-home-panel-heading">
              <h2 id="home-recent-heading" className="kivo-home-panel-title">
                Recent conversations
              </h2>
              {sortedSessions.length > 3 ? (
                <button type="button" onClick={props.onOpenSearch} className="kivo-home-view-all">View all <ArrowIcon /></button>
              ) : null}
            </div>

            {recentSessions.length ? (
              <ul className="kivo-home-session-list kivo-stagger mt-3 divide-y divide-[color-mix(in_srgb,var(--app-border-subtle)_65%,transparent)]">
                {recentSessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => props.onSelectSession(session.id)}
                      {...sessionPrefetchProps(session.id)}
                      className="kivo-home-session-row group flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-[background-color,transform] duration-200 hover:bg-[color-mix(in_srgb,var(--app-surface-hover)_70%,transparent)] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-app"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-app-muted transition-colors group-hover:bg-surface group-hover:text-app"><SessionIcon size={17} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-app">{session.title}</span>
                        <span className="mt-1 flex items-center gap-1.5 text-xs text-app-muted">
                          {session.status === "active" && session.turnCount > 0 ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#aa956c]" aria-hidden /> : null}
                          <span className="truncate">
                            {session.status === "active" && session.turnCount > 0
                              ? "In progress"
                              : props.projects.find((project) => project.id === session.projectId)?.name ?? "Conversation"}
                          </span>
                        </span>
                      </span>
                      <time className="shrink-0 text-xs tabular-nums text-app-subtle" dateTime={new Date(session.updatedAt).toISOString()}>{formatDate(session.updatedAt)}</time>
                      <ChevronRightIcon className="-ml-1 shrink-0 text-app-subtle opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <HubEmptyState
                icon={<SessionIcon size={20} />}
                title="Your first conversation starts here"
                description="Kivo will keep the summary and transcript ready for when the room clears."
                action={<button type="button" onClick={props.onPrimaryAction} disabled={props.primaryBusy} className="disabled:opacity-50 text-sm font-medium text-app underline decoration-[var(--app-border-strong)] underline-offset-4 hover:decoration-[var(--app-fg)]">Start listening</button>}
              />
            )}
          </section>

          <div className="kivo-home-secondary grid min-w-0">
            <section aria-labelledby="home-projects-heading" className="kivo-home-projects kivo-home-panel min-w-0">
              <div className="kivo-home-panel-heading">
                <h2 id="home-projects-heading" className="kivo-home-panel-title">
                  Projects
                </h2>
                <button type="button" onClick={props.onCreateProject} className="flex h-9 w-9 items-center justify-center rounded-lg text-app-muted transition-[background-color,transform,color] hover:-translate-y-0.5 hover:bg-surface-strong hover:text-app active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app" aria-label="New project"><PlusIcon size={17} /></button>
              </div>

              {props.projects.length ? (
                <ul id="home-project-list" className="mt-3">
                  {props.projects.slice(0, showAllProjects ? undefined : 4).map((project) => {
                    const count = projectSessionCount(project.id);
                    return (
                      <li key={project.id}>
                        <button type="button" onClick={() => props.onSelectProject(project.id)} className="group flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-[background-color,transform] hover:translate-x-0.5 hover:bg-[color-mix(in_srgb,var(--app-bg)_70%,transparent)] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-app">
                          <FolderIcon size={17} className="shrink-0 text-app-muted transition-colors group-hover:text-app" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-app">{project.name}</span>
                          <span className="text-xs tabular-nums text-app-muted">{count}<span className="sr-only"> {count === 1 ? "conversation" : "conversations"}</span></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="kivo-home-project-empty mt-8 pb-2">
                  <p className="font-serif text-xl tracking-[-0.025em] text-app">Give recurring conversations a home.</p>
                  <p className="mt-2 text-sm leading-relaxed text-app-muted">Projects add instructions and source material whenever Kivo answers.</p>
                  <button type="button" onClick={props.onCreateProject} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-app transition-opacity hover:opacity-55"><PlusIcon size={16} />Create a project</button>
                </div>
              )}
              {props.projects.length > 4 ? (
                <button
                  type="button"
                  onClick={() => setShowAllProjects((value) => !value)}
                  aria-expanded={showAllProjects}
                  aria-controls="home-project-list"
                  className="kivo-home-project-toggle mt-3 flex w-full items-center gap-2 border-t border-app-subtle pt-3 text-left text-xs font-medium text-app-secondary transition-colors hover:text-app focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-app"
                >
                  {showAllProjects ? "Show fewer projects" : `View all ${props.projects.length} projects`}
                  <ArrowIcon />
                </button>
              ) : null}
            </section>

          </div>
        </div>
      </div>
    </main>
  );
}
