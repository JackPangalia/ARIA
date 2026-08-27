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
  const recentSessions = sortedSessions.slice(0, 9);
  const heroMode = homeHeroMode(props.sessions);

  const projectSessionCount = (projectId: string) =>
    props.sessions.filter((session) => session.projectId === projectId).length;

  return (
    <main className="pointer-events-auto h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain" id="main-content">
      <div className="kivo-home-canvas mx-auto w-full max-w-[70rem] px-5 pb-24 pt-4 sm:px-8 sm:pb-28 sm:pt-7 xl:px-10">
        <section
          className="kivo-home-hero group relative isolate overflow-hidden rounded-[1.75rem]"
          data-mode={heroMode}
          aria-labelledby="home-hero-title"
        >
          <Image
            src="/landing/kivo-session-afterglow-motion-v1.png"
            alt="A warmly lit meeting room after a conversation"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 1120px"
            className="kivo-home-hero-image object-cover"
          />
          <div className="kivo-home-hero-scrim absolute inset-0" />
          <div className="relative z-10 flex h-full max-w-[38rem] flex-col items-start justify-end px-6 py-7 text-[#fbf8f0] sm:px-9 sm:py-9 lg:px-11 lg:py-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/62">
              {homeGreeting(hour, props.displayName)}
            </p>
            <h1 id="home-hero-title" className="mt-3 max-w-[11em] font-serif text-[1.85rem] font-normal leading-[0.98] tracking-[-0.045em] text-balance sm:text-[3.15rem]">
              {heroMode === "first_use"
                ? "Bring Kivo into the next conversation."
                : "The room is ready when you are."}
            </h1>
            <p className="mt-4 max-w-[34rem] text-sm leading-relaxed text-white/72 sm:text-[15px]">
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
          className="kivo-home-search group mt-5 flex w-full items-center gap-3 rounded-2xl border border-app-subtle bg-[color-mix(in_srgb,var(--app-surface)_55%,transparent)] px-4 py-3 text-left text-sm text-app-muted transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px hover:border-app hover:bg-surface-hover hover:text-app-secondary active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app"
        >
          <SearchIcon className="shrink-0 transition-colors group-hover:text-app" />
          <span className="min-w-0 flex-1 truncate">Search conversations</span>
          <kbd className="hidden rounded-md border border-app-subtle bg-[color-mix(in_srgb,var(--app-bg)_60%,transparent)] px-2 py-0.5 font-mono text-[10px] text-app-subtle sm:inline">⌘K</kbd>
        </button>

        <div className="kivo-home-sections mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.8fr)] lg:gap-10">
          <section aria-labelledby="home-recent-heading" className="kivo-home-section min-w-0 order-1">
            <div className="flex items-end justify-between gap-4 border-b border-app-subtle pb-3">
              <div className="min-w-0">
                <p className="kivo-kicker">Your history</p>
                <h2 id="home-recent-heading" className="mt-1 font-serif text-[1.75rem] leading-tight tracking-[-0.035em] text-app">Recent conversations</h2>
              </div>
              {sortedSessions.length > recentSessions.length ? (
                <button type="button" onClick={props.onOpenSearch} className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-app-muted transition-colors hover:bg-surface-hover hover:text-app">View all</button>
              ) : null}
            </div>

            {recentSessions.length ? (
              <ul className="kivo-stagger mt-2 divide-y divide-[var(--app-border-subtle)]">
                {recentSessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => props.onSelectSession(session.id)}
                      {...sessionPrefetchProps(session.id)}
                      className="kivo-home-session-row group flex w-full items-center gap-3 rounded-xl px-2 py-3.5 text-left transition-[background-color,transform] duration-200 hover:translate-x-1 hover:bg-[color-mix(in_srgb,var(--app-surface-hover)_70%,transparent)] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-app"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center text-app-muted transition-colors group-hover:text-app"><SessionIcon size={17} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-app">{session.title}</span>
                        <span className="mt-0.5 block text-xs text-app-subtle">
                          {session.status === "active" && session.turnCount > 0
                            ? "In progress"
                            : props.projects.find((project) => project.id === session.projectId)?.name ?? "Conversation"}
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
                action={<button type="button" onClick={props.onPrimaryAction} className="text-sm font-medium text-app underline decoration-[var(--app-border-strong)] underline-offset-4 hover:decoration-[var(--app-fg)]">Start listening</button>}
              />
            )}
          </section>

          <section aria-labelledby="home-projects-heading" className="kivo-home-projects min-w-0 order-2 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 id="home-projects-heading" className="font-serif text-[1.65rem] leading-tight tracking-[-0.035em] text-app">
                Projects
              </h2>
              <button type="button" onClick={props.onCreateProject} className="flex h-9 w-9 items-center justify-center rounded-xl bg-app text-app-muted transition-[background-color,transform,color] hover:-translate-y-0.5 hover:bg-surface-strong hover:text-app active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app" aria-label="New project"><PlusIcon size={17} /></button>
            </div>

            {props.projects.length ? (
              <ul className="mt-5 space-y-1">
                {props.projects.slice(0, 7).map((project) => {
                  const count = projectSessionCount(project.id);
                  return (
                    <li key={project.id}>
                      <button type="button" onClick={() => props.onSelectProject(project.id)} className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left transition-[background-color,transform] hover:translate-x-0.5 hover:bg-[color-mix(in_srgb,var(--app-bg)_70%,transparent)] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-app">
                        <FolderIcon size={17} className="shrink-0 text-app-muted transition-colors group-hover:text-app" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-app">{project.name}</span>
                        <span className="text-xs tabular-nums text-app-subtle">{count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-8 pb-2">
                <p className="font-serif text-xl tracking-[-0.025em] text-app">Give recurring conversations a home.</p>
                <p className="mt-2 text-sm leading-relaxed text-app-muted">Projects add instructions and source material whenever Kivo answers.</p>
                <button type="button" onClick={props.onCreateProject} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-app transition-opacity hover:opacity-55"><PlusIcon size={16} />Create a project</button>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
