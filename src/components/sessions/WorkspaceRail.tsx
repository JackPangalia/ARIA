"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ProjectDoc } from "@/lib/projects/types";
import type { SessionDoc } from "@/lib/sessions/types";
import { SidebarProfileFooter } from "@/components/sessions/SidebarProfileFooter";
import { DesktopSidebar, Sidebar } from "@/components/ui/sidebar";
import {
  FolderIcon,
  PlusIcon,
  SearchIcon,
  SessionIcon,
} from "@/components/sessions/icons";

type Surface = "home" | "project" | "session";

type WorkspaceNavigationProps = {
  expanded: boolean;
  surface: Surface;
  projects: ProjectDoc[];
  sessions: SessionDoc[];
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  onHome: () => void;
  onNewConversation: () => void;
  onSearch: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onOpenSettings: () => void;
  variant?: "rail" | "sheet";
};

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 10.5 12 4l8 6.5V20H4v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 20v-6h6v6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PanelIcon({ expanded = false }: { expanded?: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect
        x="1.75"
        y="2.25"
        width="14.5"
        height="13.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d={expanded ? "M11.25 2.25v13.5" : "M6.75 2.25v13.5"}
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NavButton(props: {
  expanded: boolean;
  active?: boolean;
  label: string;
  title?: string;
  icon: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.expanded ? undefined : (props.title ?? props.label)}
      aria-label={props.label}
      aria-current={props.active ? "page" : undefined}
      className={`kivo-rail-row group ${props.expanded ? "is-expanded" : "is-collapsed"} ${
        props.active ? "is-active" : ""
      } ${props.primary ? "is-primary" : ""}`}
    >
      <span className="kivo-rail-icon">{props.icon}</span>
      <span className={`kivo-rail-label ${props.expanded ? "" : "sr-only"}`}>
        {props.label}
      </span>
    </button>
  );
}

function WorkspaceNavigation(props: WorkspaceNavigationProps) {
  const recent = [...props.sessions].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <>
      <nav
        className={`flex flex-col px-2 pb-2 ${
          props.variant === "sheet" ? "" : "min-h-0 flex-1"
        }`}
        aria-label="Workspace"
      >
        <div className="space-y-1">
          <NavButton
            expanded={props.expanded}
            primary
            label="New conversation"
            icon={<PlusIcon size={18} />}
            onClick={props.onNewConversation}
          />
          <NavButton
            expanded={props.expanded}
            active={props.surface === "home"}
            label="Home"
            icon={<HomeIcon />}
            onClick={props.onHome}
          />
          <NavButton
            expanded={props.expanded}
            label="Search"
            icon={<SearchIcon size={18} />}
            onClick={props.onSearch}
          />
        </div>

        {props.expanded ? (
          <div
            className={`kivo-fade-in mt-7 flex flex-col px-1 ${
              props.variant === "sheet" ? "" : "min-h-0 flex-1"
            }`}
          >
            <section className="shrink-0" aria-labelledby="rail-projects-heading">
              <p id="rail-projects-heading" className="kivo-rail-section-label">
                Projects
              </p>
              <div className="mt-1 space-y-0.5">
                {props.projects.slice(0, 5).map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => props.onSelectProject(project.id)}
                    aria-current={
                      props.selectedProjectId === project.id
                        ? "page"
                        : undefined
                    }
                    className={`kivo-rail-detail-row ${props.selectedProjectId === project.id ? "is-active" : ""}`}
                  >
                    <FolderIcon size={16} className="shrink-0" />
                    <span className="truncate">{project.name}</span>
                  </button>
                ))}
                {props.projects.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs leading-relaxed text-app-subtle">
                    Create a project to keep related conversations together.
                  </p>
                ) : null}
              </div>
            </section>

            <section
              className={
                props.variant === "sheet"
                  ? "mt-6"
                  : "mt-6 flex min-h-0 flex-1 flex-col"
              }
              aria-labelledby="rail-recent-heading"
            >
              <p
                id="rail-recent-heading"
                className="kivo-rail-section-label shrink-0"
              >
                Recent
              </p>
              <div
                className={
                  props.variant === "sheet"
                    ? "mt-1 space-y-0.5 pb-2"
                    : "mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2"
                }
              >
                {recent.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => props.onSelectSession(session.id)}
                    aria-current={
                      props.selectedSessionId === session.id
                        ? "page"
                        : undefined
                    }
                    className={`kivo-rail-detail-row ${props.selectedSessionId === session.id ? "is-active" : ""}`}
                  >
                    <SessionIcon size={16} className="shrink-0" />
                    <span className="truncate">{session.title}</span>
                  </button>
                ))}
                {recent.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs leading-relaxed text-app-subtle">
                    Your conversations will collect here.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        ) : (
          <div className="mt-5 flex flex-col items-center gap-1 border-t border-app-subtle pt-4">
            <NavButton
              expanded={false}
              active={props.surface === "project"}
              label="Projects"
              icon={<FolderIcon size={18} />}
              onClick={props.onHome}
            />
            <NavButton
              expanded={false}
              active={props.surface === "session"}
              label="Recent conversations"
              icon={<SessionIcon size={18} />}
              onClick={props.onSearch}
            />
          </div>
        )}
      </nav>
      <SidebarProfileFooter
        collapsed={!props.expanded}
        onOpenSettings={props.onOpenSettings}
      />
    </>
  );
}

export function WorkspaceRail(
  props: WorkspaceNavigationProps & {
    pinnedExpanded: boolean;
    onToggle: () => void;
    onHoverExpandedChange: (expanded: boolean) => void;
    expandOnHover?: boolean;
  },
) {
  const setHoverOpen: React.Dispatch<React.SetStateAction<boolean>> = (
    value,
  ) => {
    props.onHoverExpandedChange(
      typeof value === "function" ? value(props.expanded) : value,
    );
  };

  return (
    <Sidebar open={props.expanded} setOpen={setHoverOpen}>
      <DesktopSidebar
        className="kivo-workspace-rail !hidden border-r border-app-subtle !bg-transparent !p-0 lg:!flex"
        collapsedWidth={64}
        expandedWidth={260}
        expandOnHover={props.expandOnHover}
        visibilityClassName="hidden lg:flex"
        data-expanded={props.expanded}
        role="navigation"
        aria-label="Workspace"
      >
        <div
          className="kivo-sidebar-topbar shrink-0"
          data-expanded={props.expanded}
        >
          <button
            type="button"
            onClick={props.onHome}
            aria-label="Home"
            aria-current={props.surface === "home" ? "page" : undefined}
            className={`kivo-rail-wordmark kivo-wordmark select-none text-app ${
              props.expanded ? "is-expanded" : "is-collapsed"
            }`}
          >
            {props.expanded ? "Kivo" : "K"}
          </button>
          {props.expanded ? (
            <button
              type="button"
              onClick={props.onToggle}
              className="kivo-rail-toggle"
              aria-label={
                props.pinnedExpanded
                  ? "Collapse navigation"
                  : "Keep navigation open"
              }
              title={props.pinnedExpanded ? "Collapse navigation" : "Keep open"}
            >
              <PanelIcon expanded />
            </button>
          ) : null}
        </div>
        {!props.expanded ? (
          <div className="flex w-full justify-center px-2 pb-3">
            <button
              type="button"
              onClick={props.onToggle}
              className="kivo-rail-toggle"
              aria-label="Expand navigation"
            >
              <PanelIcon />
            </button>
          </div>
        ) : null}
        <WorkspaceNavigation {...props} />
      </DesktopSidebar>
    </Sidebar>
  );
}

export function WorkspaceNavSheet(
  props: Omit<WorkspaceNavigationProps, "expanded"> & {
    open: boolean;
    onClose: () => void;
  },
) {
  const panelRef = useRef<HTMLElement>(null);
  const { open, onClose } = props;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const closeThen = (action: () => void) => () => {
    props.onClose();
    action();
  };

  const slide = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 420, damping: 38, mass: 0.86 };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="mobile-nav"
          className="fixed inset-0 z-[190] lg:hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.36 }}
        >
          <motion.button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22 }}
            onClick={props.onClose}
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            className="kivo-mobile-nav absolute inset-y-0 right-0 flex w-[min(20.5rem,88vw)] flex-col"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={slide}
          >
            <div className="safe-pt flex h-14 shrink-0 items-center justify-between px-4">
              <button
                type="button"
                onClick={closeThen(props.onHome)}
                aria-label="Home"
                className="kivo-rail-wordmark kivo-wordmark text-app"
              >
                Kivo
              </button>
              <button
                type="button"
                onClick={props.onClose}
                className="kivo-rail-toggle"
                aria-label="Close navigation"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <WorkspaceNavigation
                {...props}
                expanded
                variant="sheet"
                onHome={closeThen(props.onHome)}
                onNewConversation={closeThen(props.onNewConversation)}
                onSearch={closeThen(props.onSearch)}
                onSelectProject={(id) =>
                  closeThen(() => props.onSelectProject(id))()
                }
                onSelectSession={(id) =>
                  closeThen(() => props.onSelectSession(id))()
                }
                onOpenSettings={closeThen(props.onOpenSettings)}
              />
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
