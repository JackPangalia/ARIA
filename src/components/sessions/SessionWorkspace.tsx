"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditableSessionTitle } from "@/components/aria/EditableSessionTitle";
import { ListeningCaption } from "@/components/aria/ListeningCaption";
import { OrbVisualizer } from "@/components/aria/OrbVisualizer";
import { SessionViewTabs } from "@/components/aria/SessionViewTabs";
import { useAriaRecording } from "@/lib/audio/use-aria-recording";
import { SessionSearchModal } from "@/components/sessions/SessionSearchModal";
import { SessionHub } from "@/components/sessions/SessionHub";
import {
  WorkspaceNavSheet,
  WorkspaceRail,
} from "@/components/sessions/WorkspaceRail";
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
  relabelSessionTurns,
  subscribeSessionTurns,
} from "@/lib/sessions/client";
import { useSessionStore } from "@/lib/sessions/session-store";
import { useAriaStore } from "@/lib/store";
import { useOrbStatePublisher } from "@/lib/desktop/use-orb-state-publisher";
import { SettingsModal } from "@/components/settings/SettingsModal";
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
import { StopIcon } from "@/components/sessions/icons";
import { OverviewTray } from "@/components/sessions/OverviewTray";
import {
  OverviewView,
  type OverviewContentMode,
} from "@/components/sessions/OverviewView";
import type { SpeakerCorrectionProps } from "@/components/sessions/SessionInsightsPanel";
import {
  buildLiveTranscriptLines,
  type TranscriptLine,
} from "@/lib/sessions/live-transcript";
import { recentClusterIdentifiers } from "@/lib/speakers/identifier-cap";
import {
  learnSpeakerProfile,
  listSpeakerProfiles,
} from "@/lib/speakers/client";
import type { SpeakerProfileDoc } from "@/lib/speakers/types";
import { ProjectHubView } from "@/components/sessions/ProjectHubView";
import { ConfirmDialog } from "@/components/sessions/ConfirmDialog";
import {
  archiveProject,
  createProject,
  listProjects,
  patchProject,
} from "@/lib/projects/client";
import type { ProjectDoc } from "@/lib/projects/types";
import { useAuth } from "@/components/firebase/AuthProvider";
import { mostRecentActiveSession } from "@/lib/home";

const WORKSPACE_RAIL_STORAGE_KEY = "kivo-workspace-rail-expanded";

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NavigationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
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
    props.state?.mode === "edit" ? props.state.project.name : "",
  );
  const [instructions, setInstructions] = useState(
    props.state?.mode === "edit" ? props.state.project.instructions : "",
  );

  if (!props.state) return null;

  const title = props.state.mode === "edit" ? "Edit project" : "New project";
  const canSave = name.trim().length > 0 && !props.busy;
  const editingProject =
    props.state.mode === "edit" ? props.state.project : null;

  return (
    <div className="fixed inset-0 z-[280] flex items-center justify-center bg-overlay px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-editor-title"
        className="max-h-[min(88dvh,40rem)] w-full max-w-lg overflow-y-auto rounded-[1.5rem] border border-app-subtle bg-menu p-5 shadow-menu sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="project-editor-title"
              className="font-serif text-[1.65rem] font-normal tracking-[-0.035em] text-app"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-app-muted">
              Project instructions are included whenever Kivo answers inside
              this project.
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
          Instructions
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
  const { user } = useAuth();
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [railHoverExpanded, setRailHoverExpanded] = useState(false);
  const [pendingAutoStartSessionId, setPendingAutoStartSessionId] = useState<
    string | null
  >(null);
  const [settingsOpen, setSettingsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("settings") === "1";
  });
  const [settingsTab, setSettingsTab] =
    useState<SettingsTab>(DEFAULT_SETTINGS_TAB);
  const [trashConfirmId, setTrashConfirmId] = useState<string | null>(null);
  const [projectEditor, setProjectEditor] = useState<ProjectEditorState | null>(
    null,
  );
  const [projectArchiveId, setProjectArchiveId] = useState<string | null>(null);
  // false = voice (orb) modality, true = overview (summary + transcript).
  // Opens in overview when a session is selected; Start switches to voice.
  const [overviewMode, setOverviewMode] = useState(true);
  const [overviewContentMode, setOverviewContentMode] =
    useState<OverviewContentMode>("summary");
  const [onboardingNeeded, setOnboardingNeeded] = useState<boolean | null>(
    null,
  );
  const [speakerProfileState, setSpeakerProfileState] = useState<{
    sessionId: string;
    profiles: SpeakerProfileDoc[];
  } | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setRailExpanded(
          window.localStorage.getItem(WORKSPACE_RAIL_STORAGE_KEY) === "1",
        );
      } catch {
        // Storage is optional; compact is the intentional default.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggleRail = useCallback(() => {
    setRailHoverExpanded(false);
    setRailExpanded((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(
          WORKSPACE_RAIL_STORAGE_KEY,
          next ? "1" : "0",
        );
      } catch {
        // Keep the in-memory preference when storage is unavailable.
      }
      return next;
    });
  }, []);

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
    [],
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
    [setSessions],
  );

  const refreshDetail = useCallback(
    async (sessionId: string) => {
      const next = await getSessionDetail(sessionId);
      setDetail(next);
      setSessions(
        useSessionStore.getState().sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                title: next.session.title,
                autoTitled: next.session.autoTitled,
              }
            : session,
        ),
      );
      return next;
    },
    [setDetail, setSessions],
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
        setError(
          err instanceof Error ? err.message : "Failed to load conversations.",
        );
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

  useEffect(() => {
    if (!selectedSessionId || detail?.session.transcriptionMode !== "speaker") {
      return;
    }
    let cancelled = false;
    void listSpeakerProfiles()
      .then((profiles) => {
        if (!cancelled) {
          setSpeakerProfileState({ sessionId: selectedSessionId, profiles });
        }
      })
      .catch(() => {
        // Speaker tagging still relabels the transcript if profiles fail to load.
      });
    return () => {
      cancelled = true;
    };
  }, [detail?.session.transcriptionMode, selectedSessionId]);

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
          state.projectFilter === "project"
            ? state.selectedProjectId
            : undefined,
      });
      await refreshSessions(searchQuery);
      setSelectedSessionId(created.id);
      await refreshDetail(created.id);
      // New sessions open on the orb so Start/Resume is right there.
      setOverviewMode(false);
      return created;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create conversation.",
      );
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
    setMobileNavOpen(false);
    setRailHoverExpanded(false);
    setOverviewMode(false);
    void recording.requestStart();
  }, [recording]);

  const requestRecordingStart = recording.requestStart;

  useEffect(() => {
    if (!pendingAutoStartSessionId) return;
    if (detail?.session.id !== pendingAutoStartSessionId) return;
    if (recording.busy || recording.isRunning) return;
    const frame = window.requestAnimationFrame(() => {
      setPendingAutoStartSessionId(null);
      setMobileNavOpen(false);
      setRailHoverExpanded(false);
      setOverviewMode(false);
      void requestRecordingStart();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    detail?.session.id,
    pendingAutoStartSessionId,
    recording.busy,
    recording.isRunning,
    requestRecordingStart,
  ]);

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
    [detail?.turns, liveUtterances, recording.isRunning, micLive],
  );

  const currentSpeakerProfiles = useMemo(
    () =>
      speakerProfileState?.sessionId === selectedSessionId
        ? speakerProfileState.profiles
        : [],
    [selectedSessionId, speakerProfileState],
  );

  const handleSpeakerCorrection = useCallback(
    async (line: TranscriptLine, correctedName: string | null) => {
      if (!selectedSessionId) return;

      // With a cluster key the correction is about a *voice*: it sweeps every
      // line that cluster produced and retrains the profile. Without one — a
      // question turn persisted before questions carried a diarization label —
      // there is no voice to attach to, so the correction fixes the name on
      // this line alone and teaches nothing.
      const turnIds = line.speakerClusterKey
        ? transcriptLines
            .filter(
              (candidate) =>
                // Spoken questions belong to the same cluster as the rest of
                // that person's speech, so one correction must reach them too.
                (candidate.role === "speaker" ||
                  candidate.role === "user_question") &&
                candidate.speakerClusterKey === line.speakerClusterKey &&
                !candidate.id.startsWith("live:"),
            )
            .map((candidate) => candidate.id)
        : line.id.startsWith("live:")
          ? []
          : [line.id];
      if (turnIds.length === 0) return;

      setError(null);
      try {
        await relabelSessionTurns(selectedSessionId, turnIds, correctedName);
        await refreshDetail(selectedSessionId);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to identify speaker.",
        );
        return;
      }

      const cluster = line.speakerClusterKey
        ? recording.speakerClusters.find(
            (candidate) => candidate.clusterKey === line.speakerClusterKey,
          )
        : undefined;
      // No live cluster behind this line (an old session, or a label-less
      // question turn): the name is fixed, but there is no voiceprint to learn
      // from and no live stream to re-seed.
      if (!cluster) return;

      // A null name ("not an enrolled voice") and a cluster with no voiceprint
      // yet still need the re-seed below — there's just nothing to learn from.
      const canLearn =
        correctedName != null && cluster.speakerIdentifiers.length > 0;
      let learned: SpeakerProfileDoc | null = null;
      if (canLearn) {
        try {
          learned = await learnSpeakerProfile({
            name: correctedName,
            speakerIdentifiers: recentClusterIdentifiers(
              cluster.speakerIdentifiers,
            ),
          });
          const profile = learned;
          setSpeakerProfileState((current) => {
            const profiles =
              current?.sessionId === selectedSessionId ? current.profiles : [];
            return {
              sessionId: selectedSessionId,
              profiles: [
                profile,
                ...profiles.filter((existing) => existing.id !== profile.id),
              ],
            };
          });
        } catch (err) {
          setError(
            `Speaker label saved, but Kivo could not learn this voice: ${
              err instanceof Error ? err.message : "unknown error"
            }`,
          );
        }
      }

      // Without this the correction is cosmetic: the live stream keeps the old
      // cluster (which self-reinforces) and the profile we just learned isn't
      // seeded until the next session.
      if (recording.isRunning) {
        try {
          await recording.correctSpeaker({
            providerSpeakerLabel: cluster.providerSpeakerLabel,
            correctedName,
            learnedProfile: learned,
          });
        } catch {
          // The transcript is already fixed; a failed re-seed is not worth a
          // second error banner mid-session.
        }
      }
    },
    [
      recording,
      refreshDetail,
      selectedSessionId,
      setError,
      transcriptLines,
    ],
  );

  const speakerCorrection = useMemo<SpeakerCorrectionProps | undefined>(() => {
    if (detail?.session.transcriptionMode !== "speaker") return undefined;
    return {
      enrolledNames: currentSpeakerProfiles.map((profile) => profile.name),
      allowCreate: true,
      onCorrect: handleSpeakerCorrection,
    };
  }, [
    currentSpeakerProfiles,
    detail?.session.transcriptionMode,
    handleSpeakerCorrection,
  ]);

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
    const unsubscribeTurns = subscribeSessionTurns(
      selectedSessionId,
      (turns) => {
        const current = useSessionStore.getState().detail;
        if (!current || current.session.id !== selectedSessionId) return;
        setDetail({ ...current, turns });
      },
    );

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
    [goToStartScreen, setProjectSelection],
  );

  const handleSaveProject = async (input: {
    name: string;
    instructions: string;
  }) => {
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
      setError(
        err instanceof Error ? err.message : "Failed to archive project.",
      );
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
        loaded && !loaded.meetingSummary && loaded.turns.length === 0;
      setOverviewMode(!isEmpty);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load conversation.",
      );
    } finally {
      setActionBusy(false);
    }
  };

  const activeHomeSession = mostRecentActiveSession(sessions);

  const handleHomePrimaryAction = async () => {
    if (actionBusy || recording.busy || recording.isRunning) return;
    setActionBusy(true);
    setError(null);
    try {
      if (activeHomeSession) {
        setSelectedSessionId(activeHomeSession.id);
        await refreshDetail(activeHomeSession.id);
        setOverviewMode(false);
        setPendingAutoStartSessionId(activeHomeSession.id);
      } else {
        const created = await ensureSession();
        setPendingAutoStartSessionId(created.id);
      }
    } catch {
      // The underlying helpers already expose a user-facing error.
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
    if (
      selectedSessionId &&
      !nextSessions.some((s) => s.id === selectedSessionId)
    ) {
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
    [refreshSessions, setError, setSearchQuery],
  );

  const openSearch = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const filteredSessions = useMemo(() => sessions, [sessions]);

  const hasSession = Boolean(selectedSessionId && detail);
  const activeProject =
    projectFilter === "project" && selectedProjectId
      ? (projects.find((project) => project.id === selectedProjectId) ?? null)
      : null;
  const showProjectHub = Boolean(activeProject && !hasSession);
  const showHub = !hasSession && !activeProject;
  const showOverviewPanel =
    hasSession && overviewMode && !conversationIsEmpty && !recording.isRunning;
  const showVoicePanel =
    !showHub &&
    !showProjectHub &&
    (!overviewMode ||
      conversationIsEmpty ||
      (hasSession && recording.isRunning));
  const railSurface = showHub ? "home" : showProjectHub ? "project" : "session";
  const effectiveRailExpanded =
    railHoverExpanded || (railExpanded && !recording.isRunning);
  const canSilence =
    ariaStatus === "thinking" ||
    ariaStatus === "searching" ||
    ariaStatus === "speaking";

  const projectHubSessions = useMemo(
    () =>
      activeProject
        ? sessions.filter((session) => session.projectId === activeProject.id)
        : [],
    [sessions, activeProject],
  );

  // The header shows one crumb after the Kivo mark, naming the current surface.
  // Recording collapses it so nothing competes with the orb.
  const crumb = recording.isRunning ? null : showHub ? (
    <BreadcrumbCrumb>Home</BreadcrumbCrumb>
  ) : showProjectHub && activeProject ? (
    <BreadcrumbCrumb icon={<FolderIcon />}>
      {activeProject.name}
    </BreadcrumbCrumb>
  ) : hasSession && detail && selectedSessionId && !showOverviewPanel ? (
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
      data-sidebar-collapsed={effectiveRailExpanded ? "false" : "true"}
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

      <SettingsModal
        open={settingsOpen}
        tab={settingsTab}
        onSelectTab={setSettingsTab}
        onClose={closeSettings}
        onSessionsChanged={() => void handleSessionsChanged()}
      />

      <ConfirmDialog
        open={trashConfirmId !== null}
        title="Move conversation to trash?"
        description={(() => {
          const target = sessions.find((s) => s.id === trashConfirmId);
          const name = target?.title ?? "this conversation";
          return `“${name}” will be hidden from your conversation history. You can restore it or delete it forever from Settings → Trash.`;
        })()}
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
        description={(() => {
          const target = projects.find(
            (project) => project.id === projectArchiveId,
          );
          const name = target?.name ?? "this project";
          return `“${name}” will be hidden from Projects. Its conversations will stay available and become unassigned.`;
        })()}
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
            : (projectEditor?.mode ?? "closed")
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

      <WorkspaceNavSheet
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        surface={railSurface}
        projects={projects}
        sessions={filteredSessions}
        selectedProjectId={selectedProjectId}
        selectedSessionId={selectedSessionId}
        onHome={goToHub}
        onNewConversation={() => void handleNewSessionFromHub()}
        onSearch={openSearch}
        onSelectProject={selectProject}
        onSelectSession={(sessionId) => void handleSelectSession(sessionId)}
        onOpenSettings={openSettings}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        <WorkspaceRail
          expanded={effectiveRailExpanded}
          surface={railSurface}
          projects={projects}
          sessions={filteredSessions}
          selectedProjectId={selectedProjectId}
          selectedSessionId={selectedSessionId}
          onToggle={toggleRail}
          pinnedExpanded={railExpanded}
          onHoverExpandedChange={setRailHoverExpanded}
          expandOnHover
          onHome={goToHub}
          onNewConversation={() => void handleNewSessionFromHub()}
          onSearch={openSearch}
          onSelectProject={selectProject}
          onSelectSession={(sessionId) => void handleSelectSession(sessionId)}
          onOpenSettings={openSettings}
        />

        <section className="kivo-desktop-main relative flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
          {/* One header for every surface. It carries the desktop titlebar inset,
            the window drag region, and the offset the orb centres against, so
            no surface may opt out of it. */}
          <WorkspaceHeader
            breadcrumb={
              showOverviewPanel && detail && selectedSessionId ? (
                <OverviewTray
                  title={detail.session.title}
                  onRenameTitle={(title) =>
                    void handleRename(selectedSessionId, title)
                  }
                  mode={overviewContentMode}
                  onChangeMode={setOverviewContentMode}
                  resume={Boolean(detail.session.turnCount > 0)}
                  onResume={handleRecordingStart}
                  resumeDisabled={
                    recording.busy || detail.session.status === "archived"
                  }
                  leading={<KivoMark onClick={goToHub} />}
                />
              ) : recording.isRunning ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void recording.stop()}
                    disabled={recording.busy}
                    aria-label="Stop recording"
                    className="kivo-session-stop"
                  >
                    <StopIcon size={16} />
                    <span>Stop</span>
                  </button>
                  {canSilence ? (
                    <button
                      type="button"
                      onClick={() => recording.stopSpeaking()}
                      aria-label="Stop Kivo speaking"
                      className="kivo-session-silence"
                    >
                      Silence
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                  <KivoMark onClick={goToHub} />
                  {crumb ? <BreadcrumbSeparator /> : null}
                  {crumb}
                </>
              )
            }
            actions={
              <>
                {showOverviewPanel ? null : (
                  <>
                    {showProjectHub && activeProject ? (
                      <>
                        <HeaderPrimaryButton
                          onClick={() => void handleNewSessionFromHub()}
                          disabled={actionBusy}
                        >
                          <PlusIcon />
                          <span className="max-[420px]:sr-only">New conversation</span>
                        </HeaderPrimaryButton>
                        <ProjectActionsMenu
                          onEditProject={() =>
                            setProjectEditor({
                              mode: "edit",
                              project: activeProject,
                            })
                          }
                          onArchiveProject={() =>
                            setProjectArchiveId(activeProject.id)
                          }
                        />
                      </>
                    ) : null}

                    {hasSession &&
                    detail &&
                    selectedSessionId &&
                    !recording.isRunning &&
                    !conversationIsEmpty ? (
                      <div className="kivo-session-control-cluster">
                        <SessionViewTabs
                          resume={Boolean(detail.session.turnCount > 0)}
                          onResume={handleRecordingStart}
                          resumeDisabled={
                            recording.busy ||
                            detail.session.status === "archived"
                          }
                        />
                      </div>
                    ) : null}
                  </>
                )}
                <span className="kivo-mobile-nav-trigger lg:hidden">
                  <HeaderIconButton
                    onClick={() => setMobileNavOpen(true)}
                    label="Open navigation"
                    expanded={mobileNavOpen}
                  >
                    <NavigationIcon />
                  </HeaderIconButton>
                </span>
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
                displayName={
                  user?.displayName ?? user?.email?.split("@")[0] ?? null
                }
                projects={projects}
                sessions={filteredSessions}
                activeSession={activeHomeSession}
                onPrimaryAction={() => void handleHomePrimaryAction()}
                onOpenSearch={openSearch}
                onSelectProject={selectProject}
                onCreateProject={() => setProjectEditor({ mode: "create" })}
                onSelectSession={(sessionId) =>
                  void handleSelectSession(sessionId)
                }
              />
            </div>
          ) : null}

          {showProjectHub && activeProject ? (
            <div className="kivo-fade-in pointer-events-none flex min-h-0 flex-1 flex-col">
              <ProjectHubView
                project={activeProject}
                sessions={projectHubSessions}
                onOpenSearch={openSearch}
                onSelectSession={(sessionId) =>
                  void handleSelectSession(sessionId)
                }
              />
            </div>
          ) : null}

          {showOverviewPanel && detail && selectedSessionId ? (
            <div className="kivo-desktop-content-glass kivo-fade-in flex min-h-0 flex-1 flex-col">
              <OverviewView
                summary={detail.meetingSummary ?? null}
                transcriptLines={transcriptLines}
                contentMode={overviewContentMode}
                isRunning={recording.isRunning}
                generating={recording.busy && !recording.isRunning}
                resume={Boolean(detail.session.turnCount > 0)}
                archived={detail.session.status === "archived"}
                busy={recording.busy}
                speakerCorrection={speakerCorrection}
                onStart={handleRecordingStart}
              />
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

      {/* The voice layer is a direct child of the full workspace so neither the
          compact nor expanded in-flow rail can influence its center point. */}
      {showVoicePanel ? (
        <div className="kivo-voice-viewport pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="kivo-voice-stage pointer-events-auto w-max max-w-[calc(100%-2rem)] sm:max-w-[calc(100%-3rem)]">
            <div className="flex flex-col items-center">
              <OrbVisualizer
                onActivate={
                  recording.isRunning || detail?.session.status === "archived"
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
                  className="pointer-events-auto relative z-20 mt-3 rounded-lg px-3 py-1.5 text-sm font-medium text-app-muted transition-colors hover:bg-surface-hover hover:text-app disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {detail?.session.status === "archived"
                    ? "Archived"
                    : detail && detail.session.turnCount > 0
                      ? "Resume"
                      : "Start"}
                </button>
              ) : (
                <ListeningCaption
                  status={ariaStatus}
                  elapsedMs={recording.elapsedMs}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
