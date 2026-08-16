"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditableSessionTitle } from "@/components/aria/EditableSessionTitle";
import { OrbVisualizer } from "@/components/aria/OrbVisualizer";
import { RecordingIsland } from "@/components/aria/RecordingIsland";
import { SessionViewTabs } from "@/components/aria/SessionViewTabs";
import { useAriaRecording } from "@/lib/audio/use-aria-recording";
import { SessionSearchModal } from "@/components/sessions/SessionSearchModal";
import { SessionHub } from "@/components/sessions/SessionHub";
import {
  BreadcrumbCrumb,
  BreadcrumbSeparator,
  FolderIcon,
  HeaderIconButton,
  HeaderPrimaryButton,
  KivoMark,
  WorkspaceHeader,
} from "@/components/sessions/WorkspaceHeader";
import { ProjectActionsMenu } from "@/components/sessions/ProjectActionsMenu";
import {
  createSession,
  getSessionDetail,
  listSessions,
  patchSession,
  subscribeSessionTurns,
} from "@/lib/sessions/client";
import { useSessionStore } from "@/lib/sessions/session-store";
import { useAriaStore } from "@/lib/store";
import { useOrbStatePublisher } from "@/lib/desktop/use-orb-state-publisher";
import { SettingsSidebar } from "@/components/settings/SettingsSidebar";
import { SettingsView } from "@/components/settings/SettingsView";
import { SettingsMobile } from "@/components/settings/SettingsMobile";
import {
  DEFAULT_SETTINGS_TAB,
  type SettingsTab,
} from "@/components/settings/settings-nav";
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

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
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
    setProjects,
    setSessions,
    setSelectedSessionId,
    setProjectSelection,
    setDetail,
    setSearchQuery,
    setLoading,
    setError,
  } = useSessionStore();

  const [actionBusy, setActionBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("settings") === "1";
  });
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(DEFAULT_SETTINGS_TAB);
  const [trashConfirmId, setTrashConfirmId] = useState<string | null>(null);
  const [projectEditor, setProjectEditor] = useState<ProjectEditorState | null>(null);
  const [projectArchiveId, setProjectArchiveId] = useState<string | null>(null);
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

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSettings();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen, closeSettings]);

  const ariaStatus = useAriaStore((state) => state.status);
  const liveUtterances = useAriaStore((state) => state.utterances);
  // Feeds the desktop shell's floating orb widget; no-ops in the browser.
  useOrbStatePublisher();
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
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load conversations.");
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshDetail, refreshProjects, refreshSessions, setError, setLoading]);

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
    setOverviewMode(false);
  }, [setDetail, setError, setSelectedSessionId]);

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
      // New sessions open on the orb so Start/Resume is right there.
      setOverviewMode(false);
      return created;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create conversation.");
      throw err;
    }
  }, [
    refreshDetail,
    refreshSessions,
    searchQuery,
    setError,
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
      const current = useSessionStore.getState().detail;
      const generating = recording.busy;
      const hasContent =
        Boolean(current?.meetingSummary) || (current?.turns.length ?? 0) > 0;
      if (hasContent || generating) {
        setOverviewMode(true);
      }
    }
    prevRecordingRef.current = recording.isRunning;
  }, [recording.isRunning, recording.busy, selectedSessionId]);

  const micLive = LIVE_ARIA_STATUSES.has(ariaStatus);

  const transcriptLines = useMemo(
    () =>
      buildLiveTranscriptLines({
        turns: detail?.turns ?? [],
        utterances: recording.isRunning || micLive ? liveUtterances : [],
      }),
    [detail?.turns, liveUtterances, recording.isRunning, micLive]
  );

  const conversationIsEmpty = useMemo(() => {
    if (!detail || recording.isRunning) return false;
    if (recording.busy && !recording.isRunning) return false;
    return !detail.meetingSummary && transcriptLines.length === 0;
  }, [detail, recording.busy, recording.isRunning, transcriptLines.length]);

  // Empty conversations open on the orb — the overview placeholder is redundant.
  useEffect(() => {
    if (!conversationIsEmpty || recording.isRunning) return;
    setOverviewMode(false);
  }, [conversationIsEmpty, recording.isRunning]);

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

  const goToHub = useCallback(() => {
    setProjectSelection("all", null);
    goToStartScreen();
  }, [goToStartScreen, setProjectSelection]);

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

  // Selecting a project just opens its hub from the already-loaded global list —
  // no network round-trip, so switching projects is instant.
  const selectProject = useCallback(
    (projectId: string) => {
      setProjectSelection("project", projectId);
      goToStartScreen();
    },
    [goToStartScreen, setProjectSelection]
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

  const handleSelectSession = async (sessionId: string) => {
    setActionBusy(true);
    setError(null);
    try {
      setSelectedSessionId(sessionId);
      await refreshDetail(sessionId);
      const loaded = useSessionStore.getState().detail;
      const isEmpty =
        loaded &&
        !loaded.meetingSummary &&
        loaded.turns.length === 0;
      setOverviewMode(!isEmpty);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation.");
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
  const showHub = !hasSession && !activeProject && !settingsOpen;
  const showOverviewPanel =
    hasSession &&
    overviewMode &&
    !conversationIsEmpty &&
    !recording.isRunning &&
    !settingsOpen;
  const showVoicePanel =
    !settingsOpen &&
    !showHub &&
    !showProjectHub &&
    (!overviewMode ||
      conversationIsEmpty ||
      (hasSession && recording.isRunning));

  const projectHubSessions = useMemo(
    () =>
      activeProject
        ? sessions.filter((session) => session.projectId === activeProject.id)
        : [],
    [sessions, activeProject]
  );

  // The header shows one crumb after the Kivo mark, naming the current surface.
  // Recording collapses it so nothing competes with the live island.
  const crumb = recording.isRunning ? null : showHub ? (
    <BreadcrumbCrumb>Home</BreadcrumbCrumb>
  ) : showProjectHub && activeProject ? (
    <BreadcrumbCrumb icon={<FolderIcon />}>{activeProject.name}</BreadcrumbCrumb>
  ) : hasSession && detail && selectedSessionId ? (
    <EditableSessionTitle
      title={detail.session.title}
      onRenameTitle={(title) => void handleRename(selectedSessionId, title)}
    />
  ) : null;

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
      className="kivo-desktop-shell relative flex h-dvh w-full flex-col overflow-hidden bg-app text-app"
      data-sidebar-collapsed="true"
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

      <SettingsMobile
        open={settingsOpen}
        tab={settingsTab}
        onSelectTab={setSettingsTab}
        onClose={closeSettings}
        onSessionsChanged={() => void handleSessionsChanged()}
      />

      <ConfirmDialog
        open={trashConfirmId !== null}
        title="Move conversation to trash?"
        description={
          (() => {
            const target = sessions.find((s) => s.id === trashConfirmId);
            const name = target?.title ?? "this conversation";
            return `“${name}” will be hidden from your conversation history. You can restore it or delete it forever from Settings → Trash.`;
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
            return `“${name}” will be hidden from Projects. Its conversations will stay available and become unassigned.`;
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

      <section className="kivo-desktop-main relative flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
        {settingsOpen ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <WorkspaceHeader
              breadcrumb={
                <>
                  <KivoMark onClick={closeSettings} />
                  <BreadcrumbSeparator />
                  <BreadcrumbCrumb>Settings</BreadcrumbCrumb>
                </>
              }
            />
            <div className="flex min-h-0 flex-1">
              <div className="kivo-desktop-sidebar kivo-settings-sidebar-shell hidden h-full w-60 shrink-0 lg:flex">
                <SettingsSidebar
                  tab={settingsTab}
                  onSelectTab={setSettingsTab}
                />
              </div>
              <div className="kivo-desktop-settings-main hidden min-h-0 flex-1 flex-col lg:flex">
                <SettingsView
                  tab={settingsTab}
                  onSessionsChanged={() => void handleSessionsChanged()}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
        {/* One header for every surface. It carries the desktop titlebar inset,
            the window drag region, and the offset the orb centres against, so
            no surface may opt out of it. */}
        <WorkspaceHeader
          breadcrumb={
            <>
              <KivoMark
                onClick={showHub ? undefined : goToHub}
                dimmed={recording.isRunning}
              />
              {crumb ? (
                <>
                  <BreadcrumbSeparator />
                  {crumb}
                </>
              ) : null}
            </>
          }
          actions={
            <>
              {showHub ? (
                <>
                  <HeaderPrimaryButton
                    onClick={() => void handleNewSessionFromHub()}
                    disabled={actionBusy}
                  >
                    <PlusIcon />
                    <span>New conversation</span>
                  </HeaderPrimaryButton>
                  <HeaderIconButton onClick={openSettings} label="Open settings">
                    <SettingsIcon />
                  </HeaderIconButton>
                </>
              ) : null}

              {showProjectHub && activeProject ? (
                <>
                  <HeaderPrimaryButton
                    onClick={() => void handleNewSessionFromHub()}
                    disabled={actionBusy}
                  >
                    <PlusIcon />
                    <span>New conversation</span>
                  </HeaderPrimaryButton>
                  <ProjectActionsMenu
                    onEditProject={() =>
                      setProjectEditor({ mode: "edit", project: activeProject })
                    }
                    onArchiveProject={() => setProjectArchiveId(activeProject.id)}
                  />
                </>
              ) : null}

              {hasSession && detail && selectedSessionId ? (
                <>
                  {!recording.isRunning && !conversationIsEmpty ? (
                    <SessionViewTabs
                      overviewMode={overviewMode}
                      onChange={setOverviewMode}
                      overviewDisabled={recording.isRunning}
                      resume={Boolean(detail.session.turnCount > 0)}
                      onResume={handleRecordingStart}
                      resumeDisabled={
                        recording.busy || detail.session.status === "archived"
                      }
                    />
                  ) : null}
                  {/* Live Stop/timer while recording. Idle Resume sits under the
                      orb (and as a header action on Overview). */}
                  {recording.isRunning ? (
                    <RecordingIsland
                      isRunning={recording.isRunning}
                      busy={recording.busy}
                      elapsedMs={recording.elapsedMs}
                      resume={Boolean(detail.session.turnCount > 0)}
                      disabled={detail.session.status === "archived"}
                      status={ariaStatus}
                      onStart={handleRecordingStart}
                      onStop={() => void recording.stop()}
                      onStopSpeaking={() => {
                        recording.stopSpeaking();
                      }}
                    />
                  ) : null}
                </>
              ) : null}
            </>
          }
        />

        {error ? (
          <div className="mx-3 mb-2 shrink-0 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-danger sm:mx-4">
            {error}
          </div>
        ) : null}

        {showHub ? (
          <div className="kivo-fade-in pointer-events-none flex min-h-0 flex-1 flex-col">
            <SessionHub
              projects={projects}
              sessions={filteredSessions}
              onOpenSearch={openSearch}
              onSelectProject={selectProject}
              onCreateProject={() => setProjectEditor({ mode: "create" })}
              onSelectSession={(sessionId) => void handleSelectSession(sessionId)}
            />
          </div>
        ) : null}

        {showProjectHub && activeProject ? (
          <div className="kivo-fade-in pointer-events-none flex min-h-0 flex-1 flex-col">
            <ProjectHubView
              project={activeProject}
              sessions={projectHubSessions}
              onOpenSearch={openSearch}
              onSelectSession={(sessionId) => void handleSelectSession(sessionId)}
            />
          </div>
        ) : null}

        {showOverviewPanel && detail && selectedSessionId ? (
          <div className="kivo-desktop-content-glass kivo-fade-in flex min-h-0 flex-1 flex-col">
            <OverviewView
              summary={detail.meetingSummary ?? null}
              transcriptLines={transcriptLines}
              isRunning={recording.isRunning}
              generating={recording.busy && !recording.isRunning}
              resume={Boolean(detail.session.turnCount > 0)}
              archived={detail.session.status === "archived"}
              busy={recording.busy}
              onStart={handleRecordingStart}
            />
          </div>
        ) : null}

        {showVoicePanel ? (
          <div className="pointer-events-none flex min-h-0 flex-1 items-center justify-center">
            <div className="kivo-voice-stage pointer-events-auto w-max max-w-[calc(100%-2rem)] sm:max-w-[calc(100%-3rem)]">
              <div className="flex flex-col items-center">
                <OrbVisualizer
                  onActivate={
                    detail?.session.status === "archived" || recording.isRunning
                      ? undefined
                      : handleRecordingStart
                  }
                />
                {!recording.isRunning ? (
                  <button
                    type="button"
                    onClick={handleRecordingStart}
                    disabled={
                      recording.busy || detail?.session.status === "archived"
                    }
                    className="pointer-events-auto relative z-20 mt-2 rounded-lg px-3 py-1.5 text-[13px] font-medium text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {detail?.session.status === "archived"
                      ? "Archived"
                      : detail && detail.session.turnCount > 0
                        ? "Resume"
                        : "Start"}
                  </button>
                ) : null}
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
          </>
        )}
      </section>
    </div>
  );
}
