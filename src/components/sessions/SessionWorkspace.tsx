"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditableSessionTitle } from "@/components/aria/EditableSessionTitle";
import { ListeningCaption } from "@/components/aria/ListeningCaption";
import { OrbVisualizer } from "@/components/aria/OrbVisualizer";
import { SessionViewTabs } from "@/components/aria/SessionViewTabs";
import { useAriaRecording } from "@/lib/audio/use-aria-recording";
import { SessionSearchModal } from "@/components/sessions/SessionSearchModal";
import { SessionHub } from "@/components/sessions/SessionHub";
import { LiveSessionHeader } from "@/components/sessions/LiveSessionHeader";
import {
  WorkspaceNavSheet,
  WorkspaceRail,
} from "@/components/sessions/WorkspaceRail";
import {
  BreadcrumbCrumb,
  HeaderIconButton,
  HeaderPrimaryButton,
  WorkspaceHeader,
} from "@/components/sessions/WorkspaceHeader";
import { ProjectEditorModal, type ProjectEditorState } from "@/components/sessions/ProjectEditorModal";
import { ProjectActionsMenu } from "@/components/sessions/ProjectActionsMenu";
import {
  createSession,
  listSessions,
  patchSession,
  relabelSessionTurns,
  subscribeSessionTurns,
} from "@/lib/sessions/client";
import {
  getCachedSessionDetail,
  invalidateSessionDetail,
  loadSessionDetail,
  prefetchSessionDetail,
  primeSessionDetail,
} from "@/lib/sessions/detail-cache";
import {
  BootLoader,
  SessionOpeningSkeleton,
} from "@/components/sessions/Loaders";
import { useSessionStore } from "@/lib/sessions/session-store";
import { useAriaStore } from "@/lib/store";
import { useOrbStatePublisher } from "@/lib/desktop/use-orb-state-publisher";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { SettingsMobile } from "@/components/settings/SettingsMobile";
import {
  DEFAULT_SETTINGS_TAB,
  type SettingsTab,
} from "@/components/settings/settings-nav";
import { SessionIcon } from "@/components/sessions/icons";
import { OverviewTray } from "@/components/sessions/OverviewTray";
import { SidebarProfileFooter } from "@/components/sessions/SidebarProfileFooter";
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
import { useAuth } from "@/components/firebase/AuthProvider";
import { mostRecentActiveSession } from "@/lib/home";
import { EducationActivity, EducationProvider } from "@/components/education/EducationProvider";

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

export function SessionWorkspace() {
  const { user } = useAuth();
  if (!user) return null;
  return <EducationProvider key={user.uid} uid={user.uid}><SessionWorkspaceContent /></EducationProvider>;
}

function SessionWorkspaceContent() {
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
  const [railExpanded, setRailExpanded] = useState(true);
  const [railHoverExpanded, setRailHoverExpanded] = useState(false);
  const [pendingAutoStartSessionId, setPendingAutoStartSessionId] = useState<
    string | null
  >(null);
  // Set from the moment a conversation is clicked until its detail lands, so
  // the workspace can show that conversation's shell instead of the list.
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
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
  const [speakerProfileState, setSpeakerProfileState] = useState<{
    sessionId: string;
    profiles: SpeakerProfileDoc[];
  } | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        // Missing key and "1" both mean open. Only an explicit "0" collapses.
        setRailExpanded(
          window.localStorage.getItem(WORKSPACE_RAIL_STORAGE_KEY) !== "0",
        );
      } catch {
        // Storage is optional; the open rail is the default.
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
  const ariaNotice = useAriaStore((state) => state.notice);
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
    async (sessionId: string, options: { allowCached?: boolean } = {}) => {
      const next = await loadSessionDetail(sessionId, {
        force: !options.allowCached,
      });
      // Clicking through conversations quickly leaves earlier fetches in
      // flight; a late one must not paint over the conversation now open.
      if (useSessionStore.getState().selectedSessionId === sessionId) {
        setDetail(next);
      }
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
        invalidateSessionDetail(selectedSessionId);
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
        const next = { ...current, turns };
        setDetail(next);
        primeSessionDetail(next);
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
    setError(null);

    // Hovering the row usually warmed the cache, so the common path is a
    // synchronous swap with no loading state at all.
    const cached = getCachedSessionDetail(sessionId);
    if (cached) {
      setSelectedSessionId(sessionId);
      setDetail(cached);
      setOverviewMode(
        !(!cached.meetingSummary && cached.turns.length === 0),
      );
      void refreshDetail(sessionId).catch(() => undefined);
      return;
    }

    // Otherwise leave the list immediately and draw the conversation's shell
    // while it loads, rather than holding the click on the old screen.
    setOpeningSessionId(sessionId);
    setActionBusy(true);
    try {
      setSelectedSessionId(sessionId);
      const loaded = await refreshDetail(sessionId, { allowCached: true });
      const isEmpty = !loaded.meetingSummary && loaded.turns.length === 0;
      setOverviewMode(!isEmpty);
    } catch (err) {
      // The selection moved ahead of the detail; put it back rather than
      // leaving the workspace pointed at a conversation it never loaded.
      setSelectedSessionId(
        useSessionStore.getState().detail?.session.id ?? null,
      );
      setError(
        err instanceof Error ? err.message : "Failed to load conversation.",
      );
    } finally {
      setOpeningSessionId(null);
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
      invalidateSessionDetail(sessionId);
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
      invalidateSessionDetail(sessionId);
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
      invalidateSessionDetail(sessionId);
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
  // While a conversation is opening it owns the content column outright: no
  // hub behind it, no half-loaded detail from the session we just left.
  const opening =
    openingSessionId !== null && detail?.session.id !== openingSessionId;
  const openingTitle =
    sessions.find((session) => session.id === openingSessionId)?.title ?? null;
  const activeProject =
    projectFilter === "project" && selectedProjectId
      ? (projects.find((project) => project.id === selectedProjectId) ?? null)
      : null;
  const showProjectHub = Boolean(activeProject && !hasSession) && !opening;
  const showHub = !hasSession && !activeProject && !opening;
  const showOverviewPanel =
    !opening &&
    hasSession &&
    overviewMode &&
    !conversationIsEmpty &&
    !recording.isRunning;
  const showVoicePanel =
    !opening &&
    !showHub &&
    !showProjectHub &&
    (!overviewMode ||
      conversationIsEmpty ||
      (hasSession && recording.isRunning));
  const railSurface = showHub ? "home" : showProjectHub ? "project" : "session";
  const effectiveRailExpanded = railHoverExpanded || railExpanded;
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

  // Home needs no label; recording has its controls inside the live panel.
  const crumb = recording.isRunning || showHub ? null : showProjectHub && activeProject ? (
    <div className="kivo-project-heading">
      <h1>{activeProject.name}</h1>
      <p>{activeProject.instructions || "Conversations and source material, together in one place."}</p>
    </div>
  ) : opening ? (
    <BreadcrumbCrumb icon={<SessionIcon />}>
      {openingTitle ?? "Conversation"}
    </BreadcrumbCrumb>
  ) : hasSession && detail && selectedSessionId && !showOverviewPanel ? (
    <EditableSessionTitle
      title={detail.session.title}
      onRenameTitle={(title) => void handleRename(selectedSessionId, title)}
    />
  ) : null;

  if (loading) {
    return (
      <div className="kivo-desktop-shell flex h-dvh w-full flex-col overflow-hidden bg-app">
        <BootLoader />
      </div>
    );
  }

  return (
    <div
      className="kivo-desktop-shell relative flex h-dvh w-full flex-col overflow-hidden bg-app text-app"
      data-sidebar-collapsed={effectiveRailExpanded ? "false" : "true"}
    >
      <EducationActivity
        status={ariaStatus}
        running={recording.isRunning}
        home={showHub}
        overview={Boolean(showOverviewPanel && !recording.busy && (detail?.meetingSummary || transcriptLines.length))}
        blocked={Boolean(opening || actionBusy || recording.busy || ariaNotice || error || recording.consentOpen || settingsOpen || searchOpen || mobileNavOpen || projectEditor || trashConfirmId || projectArchiveId)}
      />
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
        suspended={projectArchiveId !== null}
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
        footer={<SidebarProfileFooter onOpenSettings={() => { setMobileNavOpen(false); openSettings(); }} />}
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
          expandOnHover={!railExpanded}
          onHome={goToHub}
          onNewConversation={() => void handleNewSessionFromHub()}
          onSearch={openSearch}
          onSelectProject={selectProject}
          onSelectSession={(sessionId) => void handleSelectSession(sessionId)}
          onOpenSettings={openSettings}
        />

        <section className={`kivo-desktop-main ${recording.isRunning ? "kivo-desktop-main--live" : showOverviewPanel ? "kivo-desktop-main--overview" : showHub ? "kivo-desktop-main--home" : showProjectHub ? "kivo-desktop-main--project" : ""} relative flex min-h-0 min-w-0 flex-1 flex-col bg-transparent`}>
          {/* Keep mobile navigation and native window dragging available. On
            desktop, Home and live mode reduce the empty header to a slim drag
            strip. Live controls sit inside the white surface. */}
          <WorkspaceHeader
            navigation={
              <span className="kivo-mobile-nav-trigger lg:hidden">
                <HeaderIconButton
                  onClick={() => setMobileNavOpen(true)}
                  label="Open navigation"
                  expanded={mobileNavOpen}
                >
                  <NavigationIcon />
                </HeaderIconButton>
              </span>
            }
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
                />
              ) : (
                crumb
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
                          <span className="sr-only sm:not-sr-only">New conversation</span>
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
              </>
            }
          />

          <div className="kivo-desktop-surface relative flex min-h-0 min-w-0 flex-1 flex-col">
            {recording.isRunning ? (
              <LiveSessionHeader
                title={detail?.session.title ?? "Conversation"}
                onRenameTitle={(title) => {
                  if (selectedSessionId) void handleRename(selectedSessionId, title);
                }}
                onStop={() => void recording.stop()}
                busy={recording.busy}
                canSilence={canSilence}
                onSilence={() => recording.stopSpeaking()}
              />
            ) : null}
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
                  primaryBusy={actionBusy}
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

            {opening ? (
              <div className="kivo-desktop-content-glass flex min-h-0 flex-1 flex-col">
                <SessionOpeningSkeleton title={openingTitle} />
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
          </div>
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
