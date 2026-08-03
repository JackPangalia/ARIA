"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditableSessionTitle, OrbVisualizer } from "@/components/aria/OrbVisualizer";
import { RecordingIsland } from "@/components/aria/RecordingIsland";
import { SessionViewTabs } from "@/components/aria/SessionViewTabs";
import { useAriaRecording } from "@/lib/audio/use-aria-recording";
import {
  SessionSidebar,
  SidebarExpandButton,
} from "@/components/sessions/SessionSidebar";
import { SessionSearchModal } from "@/components/sessions/SessionSearchModal";
import {
  createSession,
  exportSession,
  getSessionDetail,
  listSessions,
  patchSession,
  subscribeSessionTurns,
} from "@/lib/sessions/client";
import { useSessionStore } from "@/lib/sessions/session-store";
import { useAriaStore } from "@/lib/store";
import { readSidebarCollapsed, SIDEBAR_WIDTH, storeSidebarCollapsed } from "@/lib/sidebar-layout";
import { isKivoDesktop } from "@/lib/desktop/bridge";
import { SettingsModal } from "@/components/firebase/SettingsModal";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import {
  getOnboardingStatus,
  isOnboardingPreview,
} from "@/lib/onboarding/client";
import { OverviewView } from "@/components/sessions/OverviewView";
import { buildLiveTranscriptLines } from "@/lib/sessions/live-transcript";
import { ProjectHubView } from "@/components/sessions/ProjectHubView";
import { ConfirmDialog } from "@/components/sessions/ConfirmDialog";
import {
  archiveProject,
  createProject,
  listProjects,
  patchProject,
} from "@/lib/projects/client";
import type { ProjectDoc } from "@/lib/projects/types";

function SidebarToggleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 4v16" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type ProjectEditorState =
  | { mode: "create"; project?: undefined }
  | { mode: "edit"; project: ProjectDoc };

function ProjectEditorModal(props: {
  state: ProjectEditorState | null;
  busy: boolean;
  onSave: (input: { name: string; instructions: string }) => void;
  onArchive: (projectId: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(
    props.state?.mode === "edit" ? props.state.project.name : ""
  );
  const [instructions, setInstructions] = useState(
    props.state?.mode === "edit" ? props.state.project.instructions : ""
  );

  if (!props.state) return null;

  const title = props.state.mode === "edit" ? "Edit project" : "New project";
  const canSave = name.trim().length > 0 && !props.busy;
  const editingProject = props.state.mode === "edit" ? props.state.project : null;

  return (
    <div className="fixed inset-0 z-[280] flex items-center justify-center bg-overlay px-4">
      <div className="w-full max-w-lg rounded-2xl border border-app bg-app p-5 shadow-menu">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-app">{title}</h2>
            <p className="mt-1 text-sm text-app-muted">
              Project instructions are included whenever Kivo answers inside this project.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg px-2 py-1 text-sm text-app-muted hover:bg-surface-hover hover:text-app"
          >
            Close
          </button>
        </div>

        <label className="mt-5 block text-sm text-app-secondary">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            className="mt-2 w-full rounded-xl border border-app bg-surface px-3 py-2 text-sm text-app outline-none focus:border-app-strong"
            placeholder="Project name"
          />
        </label>

        <label className="mt-4 block text-sm text-app-secondary">
          Instructions/context
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            maxLength={12000}
            rows={8}
            className="mt-2 w-full resize-none rounded-xl border border-app bg-surface px-3 py-2 text-sm text-app outline-none focus:border-app-strong"
            placeholder="How should Kivo answer in this project? Add product context, preferences, or constraints."
          />
        </label>

        <div className="mt-5 flex items-center justify-between gap-3">
          {editingProject ? (
            <button
              type="button"
              onClick={() => props.onArchive(editingProject.id)}
              disabled={props.busy}
              className="rounded-xl px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
            >
              Archive project
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={props.onClose}
              disabled={props.busy}
              className="rounded-xl px-4 py-2 text-sm text-app-muted transition-colors hover:bg-surface-hover hover:text-app disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => props.onSave({ name, instructions })}
              disabled={!canSave}
              className="rounded-xl bg-accent px-4 py-2 text-sm text-accent-fg transition-opacity disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MoveSessionDialog(props: {
  open: boolean;
  projects: ProjectDoc[];
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[280] flex items-center justify-center bg-overlay px-4">
      <div className="w-full max-w-sm rounded-2xl border border-app bg-app p-5 shadow-menu">
        <h2 className="text-base font-medium text-app">Move session</h2>
        <p className="mt-1 text-sm text-app-muted">
          Choose the project this session should belong to.
        </p>
        <select
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          className="mt-4 w-full rounded-xl border border-app bg-surface px-3 py-2 text-sm text-app outline-none focus:border-app-strong"
        >
          <option value="unassigned">Unassigned</option>
          {props.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onCancel}
            disabled={props.busy}
            className="rounded-xl px-4 py-2 text-sm text-app-muted transition-colors hover:bg-surface-hover hover:text-app disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.busy}
            className="rounded-xl bg-accent px-4 py-2 text-sm text-accent-fg transition-opacity disabled:opacity-50"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );
}

export function SessionWorkspace() {
  const {
    projects,
    sessions,
    selectedSessionId,
    selectedProjectId,
    projectFilter,
    detail,
    searchQuery,
    loading,
    error,
    sidebarOpen,
    setProjects,
    setSessions,
    setSelectedSessionId,
    setProjectSelection,
    setDetail,
    setSearchQuery,
    setLoading,
    setError,
    setSidebarOpen,
  } = useSessionStore();

  const [actionBusy, setActionBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [panelsCollapsed, setPanelsCollapsedState] = useState(
    () => readSidebarCollapsed()
  );
  const [sidebarExiting, setSidebarExiting] = useState(false);
  const sidebarExitingRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("settings") === "1";
  });
  const [trashConfirmId, setTrashConfirmId] = useState<string | null>(null);
  const [projectEditor, setProjectEditor] = useState<ProjectEditorState | null>(null);
  const [projectArchiveId, setProjectArchiveId] = useState<string | null>(null);
  const [moveSessionId, setMoveSessionId] = useState<string | null>(null);
  const [moveTargetProjectId, setMoveTargetProjectId] = useState<string>("unassigned");
  // false = voice (orb) modality, true = overview (summary + transcript).
  // Opens in overview when a session is selected; Start switches to voice.
  const [overviewMode, setOverviewMode] = useState(true);
  const [onboardingNeeded, setOnboardingNeeded] = useState<boolean | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("settings") === "1") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const setPanelsCollapsed = useCallback((collapsed: boolean) => {
    setPanelsCollapsedState(collapsed);
    storeSidebarCollapsed(collapsed);
  }, []);

  const expandPanels = useCallback(() => {
    sidebarExitingRef.current = false;
    setSidebarExiting(false);
    setPanelsCollapsed(false);
  }, [setPanelsCollapsed]);

  const collapsePanels = useCallback(() => {
    // Electron: skip the slide-out path. Transform animations on the sidebar
    // ancestor break -webkit-app-region hit-testing, and waiting on
    // animationend is unreliable with the desktop fill-mode overrides.
    if (
      isKivoDesktop() ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      sidebarExitingRef.current = false;
      setSidebarExiting(false);
      setPanelsCollapsed(true);
      return;
    }
    sidebarExitingRef.current = true;
    setSidebarExiting(true);
  }, [setPanelsCollapsed]);

  const handleSidebarAnimationEnd = useCallback(
    (event: React.AnimationEvent<HTMLDivElement>) => {
      if (!event.animationName.includes("kivo-slide-out-left")) return;
      if (!sidebarExitingRef.current) return;
      sidebarExitingRef.current = false;
      setSidebarExiting(false);
      setPanelsCollapsed(true);
    },
    [setPanelsCollapsed]
  );

  const showDesktopSidebar = !panelsCollapsed || sidebarExiting;

  const ariaStatus = useAriaStore((state) => state.status);
  const liveUtterances = useAriaStore((state) => state.utterances);
  const bootstrappedRef = useRef(false);
  const searchDebounceRef = useRef<number | null>(null);

  const LIVE_ARIA_STATUSES = useMemo(
    () =>
      new Set([
        "listening",
        "capturing-question",
        "thinking",
        "searching",
        "speaking",
        "follow-up-listening",
        "wake-detected",
      ]),
    []
  );

  const refreshProjects = useCallback(async () => {
    const next = await listProjects();
    setProjects(next);
    const state = useSessionStore.getState();
    if (
      state.projectFilter === "project" &&
      state.selectedProjectId &&
      !next.some((project) => project.id === state.selectedProjectId)
    ) {
      setProjectSelection("all", null);
    }
    return next;
  }, [setProjectSelection, setProjects]);

  // The sidebar always shows the full, global session history. Project scoping
  // happens client-side in the project hub, so we never refetch on project click.
  const refreshSessions = useCallback(
    async (query?: string) => {
      const next = await listSessions({ q: query, limit: 50 });
      setSessions(next);
      return next;
    },
    [setSessions]
  );

  const refreshDetail = useCallback(
    async (sessionId: string) => {
      const next = await getSessionDetail(sessionId);
      setDetail(next);
      setSessions(
        useSessionStore.getState().sessions.map((session) =>
          session.id === sessionId
            ? { ...session, title: next.session.title, autoTitled: next.session.autoTitled }
            : session
        )
      );
      return next;
    },
    [setDetail, setSessions]
  );

  const handleSessionActivity = useCallback(() => {
    if (!selectedSessionId) return;
    void refreshDetail(selectedSessionId).catch(() => undefined);
  }, [refreshDetail, selectedSessionId]);

  const refreshSelectedChat = useCallback(async () => {
    if (!selectedSessionId) return [];
    return (await refreshDetail(selectedSessionId)).turns;
  }, [refreshDetail, selectedSessionId]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    void (async () => {
      setError(null);
      try {
        await Promise.all([refreshProjects(), refreshSessions()]);
        const existingId = useSessionStore.getState().selectedSessionId;
        if (existingId) {
          await refreshDetail(existingId);
          expandPanels();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sessions.");
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshDetail, refreshProjects, refreshSessions, setError, setLoading, expandPanels]);

  useEffect(() => {
    if (loading) return;
    if (isOnboardingPreview()) {
      setOnboardingNeeded(true);
      return;
    }
    let cancelled = false;
    void getOnboardingStatus()
      .then(({ needed }) => {
        if (!cancelled) setOnboardingNeeded(needed);
      })
      .catch(() => {
        if (!cancelled) setOnboardingNeeded(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loading]);

  const goToStartScreen = useCallback(() => {
    setSelectedSessionId(null);
    setDetail(null);
    setError(null);
    setSidebarOpen(false);
    setOverviewMode(false);
  }, [setDetail, setError, setSelectedSessionId, setSidebarOpen]);

  const ensureSession = useCallback(async () => {
    setError(null);
    try {
      const state = useSessionStore.getState();
      const created = await createSession({
        speakerCount: 2,
        projectId:
          state.projectFilter === "project" ? state.selectedProjectId : undefined,
      });
      await refreshSessions(searchQuery);
      setSelectedSessionId(created.id);
      await refreshDetail(created.id);
      setOverviewMode(true);
      expandPanels();
      return created;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session.");
      throw err;
    }
  }, [
    refreshDetail,
    refreshSessions,
    searchQuery,
    setError,
    expandPanels,
    setSelectedSessionId,
  ]);

  // Recording lives above the voice/chat views so switching modality never
  // tears down the mic. One engine, one clock, shared by both.
  const recording = useAriaRecording({
    sessionId: selectedSessionId,
    transcriptionMode: detail?.session.transcriptionMode ?? "speaker",
    ensureSession,
    onActivity: handleSessionActivity,
  });
  const handleRecordingStart = useCallback(() => {
    setOverviewMode(false);
    void recording.requestStart();
  }, [recording]);

  const prevRecordingRef = useRef(false);
  useEffect(() => {
    if (!recording.isRunning && prevRecordingRef.current && selectedSessionId) {
      setOverviewMode(true);
    }
    prevRecordingRef.current = recording.isRunning;
  }, [recording.isRunning, selectedSessionId]);

  const micLive = LIVE_ARIA_STATUSES.has(ariaStatus);

  const transcriptLines = useMemo(
    () =>
      buildLiveTranscriptLines({
        turns: detail?.turns ?? [],
        utterances: recording.isRunning || micLive ? liveUtterances : [],
      }),
    [detail?.turns, liveUtterances, recording.isRunning, micLive]
  );

  useEffect(() => {
    if (!selectedSessionId) return;
    if (!micLive) return;

    // Stream committed turns; polling remains as a metadata/listener fallback,
    // while mic partials render from local state.
    const unsubscribeTurns = subscribeSessionTurns(selectedSessionId, (turns) => {
      const current = useSessionStore.getState().detail;
      if (!current || current.session.id !== selectedSessionId) return;
      setDetail({ ...current, turns });
    });

    const timer = window.setInterval(() => {
      void refreshDetail(selectedSessionId).catch(() => undefined);
    }, 8000);

    return () => {
      unsubscribeTurns();
      window.clearInterval(timer);
    };
  }, [micLive, refreshDetail, selectedSessionId, setDetail]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const handleNewSession = () => {
    setProjectSelection("all", null);
    goToStartScreen();
  };

  const handleNewSessionFromHub = useCallback(async () => {
    setActionBusy(true);
    setError(null);
    try {
      await ensureSession();
    } catch {
      // ensureSession already sets error state
    } finally {
      setActionBusy(false);
    }
  }, [ensureSession, setError]);

  const handleSaveProjectInstructions = async (instructions: string) => {
    if (!selectedProjectId) return;
    setActionBusy(true);
    setError(null);
    try {
      await patchProject(selectedProjectId, { instructions });
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project context.");
    } finally {
      setActionBusy(false);
    }
  };

  // Selecting a project just opens its hub from the already-loaded global list —
  // no network round-trip, so switching projects is instant.
  const selectProject = useCallback(
    (projectId: string) => {
      setProjectSelection("project", projectId);
      goToStartScreen();
      setSidebarOpen(false);
    },
    [goToStartScreen, setProjectSelection, setSidebarOpen]
  );

  const handleSaveProject = async (input: { name: string; instructions: string }) => {
    setActionBusy(true);
    setError(null);
    try {
      if (projectEditor?.mode === "edit") {
        await patchProject(projectEditor.project.id, input);
      } else {
        const created = await createProject(input);
        setProjectSelection("project", created.id);
        goToStartScreen();
      }
      setProjectEditor(null);
      await refreshProjects();
      await refreshSessions(searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleArchiveProject = async (projectId: string) => {
    setActionBusy(true);
    setError(null);
    try {
      await archiveProject(projectId);
      setProjectArchiveId(null);
      setProjectEditor(null);
      if (selectedProjectId === projectId) {
        setProjectSelection("all", null);
        goToStartScreen();
      }
      await refreshProjects();
      await refreshSessions(searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive project.");
    } finally {
      setActionBusy(false);
    }
  };

  const openMoveSessionDialog = (sessionId: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    setMoveSessionId(sessionId);
    setMoveTargetProjectId(session?.projectId ?? "unassigned");
  };

  const handleMoveSession = async () => {
    if (!moveSessionId) return;
    setActionBusy(true);
    setError(null);
    try {
      const projectId =
        moveTargetProjectId === "unassigned" ? null : moveTargetProjectId;
      const updated = await patchSession(moveSessionId, { projectId });
      if (detail?.session.id === moveSessionId) {
        setDetail({ ...detail, session: updated });
      }
      setMoveSessionId(null);
      await refreshSessions(searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move session.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    setActionBusy(true);
    setError(null);
    try {
      setSelectedSessionId(sessionId);
      await refreshDetail(sessionId);
      setOverviewMode(true);
      setSidebarOpen(false);
      expandPanels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleRename = async (sessionId: string, title: string) => {
    setActionBusy(true);
    setError(null);
    try {
      const updated = await patchSession(sessionId, { title });
      if (detail?.session.id === sessionId) {
        setDetail({ ...detail, session: updated });
      }
      await refreshSessions(searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleTogglePin = async (sessionId: string, pinned: boolean) => {
    setActionBusy(true);
    setError(null);
    try {
      const updated = await patchSession(sessionId, { pinned });
      if (detail?.session.id === sessionId) {
        setDetail({ ...detail, session: updated });
      }
      await refreshSessions(searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pin.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleExport = async (sessionId: string, format: "markdown" | "json") => {
    setActionBusy(true);
    try {
      const content = await exportSession(sessionId, format);
      downloadText(
        `kivo-session-${sessionId}.${format === "json" ? "json" : "md"}`,
        content,
        format === "json" ? "application/json" : "text/markdown"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleTrashSession = async (sessionId: string) => {
    setActionBusy(true);
    setError(null);
    try {
      await patchSession(sessionId, { status: "trashed" });
      if (selectedSessionId === sessionId) {
        await refreshSessions(searchQuery);
        goToStartScreen();
      } else {
        await refreshSessions(searchQuery);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Move to trash failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleSessionsChanged = useCallback(async () => {
    const nextSessions = await refreshSessions(searchQuery);
    if (selectedSessionId && !nextSessions.some((s) => s.id === selectedSessionId)) {
      goToStartScreen();
    }
  }, [goToStartScreen, refreshSessions, searchQuery, selectedSessionId]);

  const handleArchiveSession = async (sessionId: string) => {
    setActionBusy(true);
    setError(null);
    try {
      await patchSession(sessionId, { status: "archived" });
      if (selectedSessionId === sessionId) {
        await refreshSessions(searchQuery);
        goToStartScreen();
      } else {
        await refreshSessions(searchQuery);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);

      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
      }

      searchDebounceRef.current = window.setTimeout(() => {
        void refreshSessions(value).catch((err) => {
          setError(err instanceof Error ? err.message : "Search failed.");
        });
      }, 250);
    },
    [refreshSessions, setError, setSearchQuery]
  );

  const openSearch = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const filteredSessions = useMemo(() => sessions, [sessions]);

  const hasSession = Boolean(selectedSessionId && detail);
  const activeProject =
    projectFilter === "project" && selectedProjectId
      ? projects.find((project) => project.id === selectedProjectId) ?? null
      : null;
  const showProjectHub = Boolean(activeProject && !hasSession);
  const showOverviewPanel =
    hasSession && overviewMode && !recording.isRunning && !settingsOpen;
  const showVoicePanel =
    !settingsOpen &&
    !showProjectHub &&
    (!overviewMode || (hasSession && recording.isRunning));

  const projectHubSessions = useMemo(
    () =>
      activeProject
        ? sessions.filter((session) => session.projectId === activeProject.id)
        : [],
    [sessions, activeProject]
  );

  if (loading || onboardingNeeded === null) {
    return (
      <div className="kivo-desktop-shell grid h-dvh w-full grid-cols-1 overflow-hidden bg-app">
        <div className="flex items-center justify-center">
          <div className="kivo-skeleton h-48 w-48 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="kivo-desktop-shell relative h-dvh w-full overflow-hidden bg-app text-app"
      data-sidebar-collapsed={panelsCollapsed && !sidebarExiting ? "true" : "false"}
    >
      {onboardingNeeded ? (
        <OnboardingFlow
          preview={isOnboardingPreview()}
          onComplete={() => {
            setOnboardingNeeded(false);
            if (isOnboardingPreview()) {
              window.history.replaceState({}, "", window.location.pathname);
            }
          }}
        />
      ) : null}

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close sessions"
            className="kivo-overlay-in absolute inset-0 bg-overlay"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="kivo-panel-in-left absolute inset-0 w-full bg-app">
            <SessionSidebar
              projects={projects}
              sessions={filteredSessions}
              selectedSessionId={selectedSessionId}
              selectedProjectId={selectedProjectId}
              onOpenSearch={() => {
                setSidebarOpen(false);
                openSearch();
              }}
              onSelectProject={(id) => selectProject(id)}
              onCreateProject={() => setProjectEditor({ mode: "create" })}
              onEditProject={(project) => setProjectEditor({ mode: "edit", project })}
              onSelect={handleSelectSession}
              onCreate={handleNewSession}
              onClose={() => setSidebarOpen(false)}
              onRename={(id, title) => void handleRename(id, title)}
              onTogglePin={(id, pinned) => void handleTogglePin(id, pinned)}
              onMoveToProject={openMoveSessionDialog}
              onExportMarkdown={(id) => void handleExport(id, "markdown")}
              onExportJson={(id) => void handleExport(id, "json")}
              onTrash={(id) => setTrashConfirmId(id)}
              onOpenSettings={() => {
                setSidebarOpen(false);
                setSettingsOpen(true);
              }}
            />
          </div>
        </div>
      ) : null}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSessionsChanged={() => void handleSessionsChanged()}
      />

      <ConfirmDialog
        open={trashConfirmId !== null}
        title="Move session to trash?"
        description={
          (() => {
            const target = sessions.find((s) => s.id === trashConfirmId);
            const name = target?.title ?? "this session";
            return `“${name}” will be hidden from the sidebar. You can restore it or delete it forever from Settings → Trash.`;
          })()
        }
        confirmLabel="Move to trash"
        danger
        busy={actionBusy}
        onCancel={() => setTrashConfirmId(null)}
        onConfirm={() => {
          const id = trashConfirmId;
          if (!id) return;
          setTrashConfirmId(null);
          void handleTrashSession(id);
        }}
      />

      <ConfirmDialog
        open={projectArchiveId !== null}
        title="Archive project?"
        description={
          (() => {
            const target = projects.find((project) => project.id === projectArchiveId);
            const name = target?.name ?? "this project";
            return `“${name}” will be hidden from Projects. Its sessions will stay available and become unassigned.`;
          })()
        }
        confirmLabel="Archive project"
        danger
        busy={actionBusy}
        onCancel={() => setProjectArchiveId(null)}
        onConfirm={() => {
          const id = projectArchiveId;
          if (!id) return;
          void handleArchiveProject(id);
        }}
      />

      <ProjectEditorModal
        key={
          projectEditor?.mode === "edit"
            ? `edit-${projectEditor.project.id}`
            : projectEditor?.mode ?? "closed"
        }
        state={projectEditor}
        busy={actionBusy}
        onSave={(input) => void handleSaveProject(input)}
        onArchive={(projectId) => setProjectArchiveId(projectId)}
        onClose={() => setProjectEditor(null)}
      />

      <MoveSessionDialog
        open={moveSessionId !== null}
        projects={projects}
        value={moveTargetProjectId}
        busy={actionBusy}
        onChange={setMoveTargetProjectId}
        onCancel={() => setMoveSessionId(null)}
        onConfirm={() => void handleMoveSession()}
      />

      <SessionSearchModal
        open={searchOpen}
        query={searchQuery}
        sessions={filteredSessions}
        selectedSessionId={selectedSessionId}
        onQueryChange={handleSearch}
        onSelect={handleSelectSession}
        onCreateNew={() => {
          handleNewSession();
          setSearchOpen(false);
        }}
        onRename={handleRename}
        onArchive={(sessionId) => void handleArchiveSession(sessionId)}
        onClose={() => setSearchOpen(false)}
      />

      {/* In-flow sidebar + main: content cannot underlap the sidebar at any width. */}
      <div className="flex h-full min-h-0 w-full">
      {showDesktopSidebar ? (
      <div
        aria-hidden={panelsCollapsed && !sidebarExiting}
        className={`kivo-desktop-sidebar hidden h-full min-h-0 shrink-0 flex-col bg-transparent lg:flex${
          sidebarExiting ? " kivo-slide-out-left" : " kivo-slide-in-left"
        }`}
        style={{ width: SIDEBAR_WIDTH }}
        onAnimationEnd={handleSidebarAnimationEnd}
      >
        <SessionSidebar
          projects={projects}
          sessions={filteredSessions}
          selectedSessionId={selectedSessionId}
          selectedProjectId={selectedProjectId}
          onOpenSearch={openSearch}
          onSelectProject={(id) => selectProject(id)}
          onCreateProject={() => setProjectEditor({ mode: "create" })}
          onEditProject={(project) => setProjectEditor({ mode: "edit", project })}
          onSelect={handleSelectSession}
          onCreate={handleNewSession}
          onCollapse={collapsePanels}
          onRename={(id, title) => void handleRename(id, title)}
          onTogglePin={(id, pinned) => void handleTogglePin(id, pinned)}
          onMoveToProject={openMoveSessionDialog}
          onExportMarkdown={(id) => void handleExport(id, "markdown")}
          onExportJson={(id) => void handleExport(id, "json")}
          onTrash={(id) => setTrashConfirmId(id)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>
      ) : null}

      <section className="kivo-desktop-main relative flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
        <header className="kivo-session-topbar pointer-events-auto z-10 flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-3 sm:px-4">
          <div className="flex min-w-0 shrink-0 items-center gap-1">
            {panelsCollapsed ? (
              <SidebarExpandButton onClick={() => expandPanels()} />
            ) : null}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sessions"
              className="kivo-mobile-open-sidebar inline-flex h-10 w-10 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary active:bg-surface-hover lg:hidden"
            >
              <SidebarToggleIcon />
            </button>
          </div>

          {hasSession && detail && selectedSessionId ? (
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-hidden sm:gap-3">
              <EditableSessionTitle
                title={detail.session.title}
                onRenameTitle={(title) => void handleRename(selectedSessionId, title)}
              />
              <SessionViewTabs
                overviewMode={overviewMode}
                onChange={setOverviewMode}
                overviewDisabled={recording.isRunning}
              />
              {/* Resume/Start lives on the Overview chat dock; keep the island
                  for Voice idle Start and for live Stop/timer while recording. */}
              {recording.isRunning || !overviewMode ? (
                <RecordingIsland
                  isRunning={recording.isRunning}
                  busy={recording.busy}
                  elapsedMs={recording.elapsedMs}
                  resume={Boolean(detail.session.turnCount > 0)}
                  disabled={detail.session.status === "archived"}
                  assistantActive={
                    ariaStatus === "thinking" ||
                    ariaStatus === "searching" ||
                    ariaStatus === "speaking"
                  }
                  onStart={handleRecordingStart}
                  onStop={() => void recording.stop()}
                  onStopSpeaking={() => {
                    recording.stopSpeaking();
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </header>

        {error ? (
          <div className="mx-3 mb-2 shrink-0 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-danger sm:mx-4">
            {error}
          </div>
        ) : null}

        {showProjectHub && activeProject ? (
          <div className="kivo-fade-in pointer-events-none flex min-h-0 flex-1 flex-col">
            <ProjectHubView
              project={activeProject}
              sessions={projectHubSessions}
              busy={actionBusy}
              onNewSession={() => void handleNewSessionFromHub()}
              onSelectSession={(sessionId) => void handleSelectSession(sessionId)}
              onEditProject={() => setProjectEditor({ mode: "edit", project: activeProject })}
              onArchiveProject={() => setProjectArchiveId(activeProject.id)}
              onSaveInstructions={(instructions) => void handleSaveProjectInstructions(instructions)}
            />
          </div>
        ) : null}

        {showOverviewPanel && detail && selectedSessionId ? (
          <div className="kivo-desktop-content-glass kivo-fade-in min-h-0 flex-1">
            <OverviewView
              sessionId={selectedSessionId}
              summary={detail.meetingSummary ?? null}
              transcriptLines={transcriptLines}
              turns={detail.turns}
              isRunning={recording.isRunning}
              generating={recording.busy && !recording.isRunning}
              chatDisabled={detail.session.status === "archived"}
              onRefreshChat={refreshSelectedChat}
              resumeLabel={
                detail.session.turnCount > 0 ? "RESUME" : "START"
              }
              resumeBusy={recording.busy}
              onResume={handleRecordingStart}
            />
          </div>
        ) : null}

        {showVoicePanel ? (
          <div className="pointer-events-none flex min-h-0 flex-1 items-center justify-center">
            <div className="pointer-events-auto w-max max-w-[calc(100%-2rem)] sm:max-w-[calc(100%-3rem)]">
              <div className="flex flex-col items-center gap-7 sm:gap-10">
                <div className="relative flex flex-col items-center">
                  <OrbVisualizer
                    onActivate={
                      detail?.session.status === "archived"
                        ? undefined
                        : handleRecordingStart
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <ConfirmDialog
          open={recording.consentOpen}
          title="Before Kivo starts listening"
          description="Kivo transcribes everything your microphone hears, including other people. Make sure everyone present knows the conversation is being transcribed and consents — some places legally require it."
          confirmLabel="Everyone knows — start"
          cancelLabel="Not yet"
          onConfirm={recording.confirmConsent}
          onCancel={recording.cancelConsent}
        />
      </section>
      </div>
    </div>
  );
}
