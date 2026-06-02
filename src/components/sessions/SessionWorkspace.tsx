"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controls } from "@/components/aria/Controls";
import { MeetingBotControls } from "@/components/aria/MeetingBotControls";
import { OrbVisualizer } from "@/components/aria/OrbVisualizer";
import { UsageMeter } from "@/components/aria/UsageMeter";
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
import { readSidebarCollapsed, storeSidebarCollapsed } from "@/lib/sidebar-layout";
import { SettingsModal } from "@/components/firebase/SettingsModal";
import {
  SessionInsightsPanel,
  TranscriptExpandButton,
} from "@/components/sessions/SessionInsightsPanel";
import { ConfirmDialog } from "@/components/sessions/ConfirmDialog";
import { MEETING_BOT_ENABLED } from "@/lib/features";

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

export function SessionWorkspace() {
  const {
    sessions,
    selectedSessionId,
    detail,
    searchQuery,
    loading,
    error,
    sidebarOpen,
    setSessions,
    setSelectedSessionId,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trashConfirmId, setTrashConfirmId] = useState<string | null>(null);
  // false = in-person (mic) mode, true = meeting (bot) mode. One per session so
  // the two capture paths never run at once. Kept in sync with whatever is live.
  const [meetingMode, setMeetingMode] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });

  const openSummaryIfDesktop = useCallback(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setSummaryOpen(true);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("settings") === "1") {
      setSettingsOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const setPanelsCollapsed = useCallback((collapsed: boolean) => {
    setPanelsCollapsedState(collapsed);
    storeSidebarCollapsed(collapsed);
  }, []);

  const ariaStatus = useAriaStore((state) => state.status);
  const bootstrappedRef = useRef(false);
  const searchDebounceRef = useRef<number | null>(null);

  const LIVE_ARIA_STATUSES = useMemo(
    () =>
      new Set([
        "listening",
        "capturing-question",
        "thinking",
        "speaking",
        "follow-up-listening",
        "wake-detected",
      ]),
    []
  );

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
        await refreshSessions();
        const existingId = useSessionStore.getState().selectedSessionId;
        if (existingId) {
          await refreshDetail(existingId);
          setPanelsCollapsed(false);
          openSummaryIfDesktop();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sessions.");
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshDetail, refreshSessions, setError, setLoading, openSummaryIfDesktop, setPanelsCollapsed]);

  const goToStartScreen = useCallback(() => {
    setSelectedSessionId(null);
    setDetail(null);
    setError(null);
    setSidebarOpen(false);
    setSummaryOpen(false);
  }, [setDetail, setError, setSelectedSessionId, setSidebarOpen]);

  const ensureSession = useCallback(async () => {
    setError(null);
    try {
      const created = await createSession({ speakerCount: 2 });
      await refreshSessions(searchQuery);
      setSelectedSessionId(created.id);
      await refreshDetail(created.id);
      setPanelsCollapsed(false);
      openSummaryIfDesktop();
      return created.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session.");
      throw err;
    }
  }, [
    openSummaryIfDesktop,
    refreshDetail,
    refreshSessions,
    searchQuery,
    setDetail,
    setError,
    setPanelsCollapsed,
    setSelectedSessionId,
  ]);

  const botActive =
    MEETING_BOT_ENABLED &&
    (detail?.session.botStatus === "joining" ||
      detail?.session.botStatus === "live");
  const micLive = LIVE_ARIA_STATUSES.has(ariaStatus);

  // The mode actually shown: a running bot forces "meeting", a live mic forces
  // "in-person", otherwise the user's toggle choice. Switching is disabled while
  // either is active, so the two modes can never capture simultaneously.
  const meetingModeActive = botActive ? true : micLive ? false : meetingMode;

  useEffect(() => {
    if (!selectedSessionId) return;
    if (!micLive && !botActive) return;

    // Bot mode: live Firestore subscription for turns (worker persists server-side).
    // Fall back to polling for session metadata and when the listener is unavailable.
    let unsubscribeTurns: (() => void) | undefined;
    if (botActive) {
      unsubscribeTurns = subscribeSessionTurns(selectedSessionId, (turns) => {
        const current = useSessionStore.getState().detail;
        if (!current || current.session.id !== selectedSessionId) return;
        setDetail({ ...current, turns });
      });
    }

    const intervalMs = botActive ? 10000 : 8000;
    const timer = window.setInterval(() => {
      void refreshDetail(selectedSessionId).catch(() => undefined);
    }, intervalMs);

    return () => {
      unsubscribeTurns?.();
      window.clearInterval(timer);
    };
  }, [micLive, botActive, refreshDetail, selectedSessionId, setDetail]);

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
    goToStartScreen();
  };

  const handleSelectSession = async (sessionId: string) => {
    setActionBusy(true);
    setError(null);
    try {
      setSelectedSessionId(sessionId);
      await refreshDetail(sessionId);
      setSidebarOpen(false);
      setPanelsCollapsed(false);
      openSummaryIfDesktop();
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
        `aria-session-${sessionId}.${format === "json" ? "json" : "md"}`,
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

  const gridClass = panelsCollapsed
    ? "grid-cols-1"
    : "lg:grid-cols-[16rem_minmax(0,1fr)]";

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-app text-app-muted">
        Loading sessions...
      </div>
    );
  }

  const hasSession = Boolean(selectedSessionId && detail);

  return (
    <div
      className={`grid h-dvh w-full grid-cols-1 overflow-hidden bg-app text-app ${gridClass}`}
    >
      {!panelsCollapsed ? (
        <div className="hidden min-h-0 lg:block">
          <SessionSidebar
            sessions={filteredSessions}
            selectedSessionId={selectedSessionId}
            onOpenSearch={openSearch}
            onSelect={handleSelectSession}
            onCreate={handleNewSession}
            onCollapse={() => setPanelsCollapsed(true)}
            onRename={(id, title) => void handleRename(id, title)}
            onTogglePin={(id, pinned) => void handleTogglePin(id, pinned)}
            onExportMarkdown={(id) => void handleExport(id, "markdown")}
            onExportJson={(id) => void handleExport(id, "json")}
            onTrash={(id) => setTrashConfirmId(id)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
      ) : null}

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close sessions"
            className="absolute inset-0 bg-overlay"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-0 w-full bg-app">
            <SessionSidebar
              sessions={filteredSessions}
              selectedSessionId={selectedSessionId}
              onOpenSearch={() => {
                setSidebarOpen(false);
                openSearch();
              }}
              onSelect={handleSelectSession}
              onCreate={handleNewSession}
              onClose={() => setSidebarOpen(false)}
              onRename={(id, title) => void handleRename(id, title)}
              onTogglePin={(id, pinned) => void handleTogglePin(id, pinned)}
              onExportMarkdown={(id) => void handleExport(id, "markdown")}
              onExportJson={(id) => void handleExport(id, "json")}
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

      <section className="relative h-full min-h-0 min-w-0 bg-app">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-start px-3 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
          <div className="pointer-events-auto flex items-center gap-1 justify-self-start">
            {panelsCollapsed ? (
              <SidebarExpandButton onClick={() => setPanelsCollapsed(false)} />
            ) : null}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sessions"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary active:bg-surface-hover lg:hidden"
            >
              <SidebarToggleIcon />
            </button>
          </div>

          <div className="pointer-events-auto col-start-3 flex items-center gap-1 justify-self-end">
            {hasSession && !summaryOpen ? (
              <TranscriptExpandButton onClick={() => setSummaryOpen(true)} />
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="absolute inset-x-4 top-16 z-10 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-danger">
            {error}
          </div>
        ) : null}

        {hasSession && summaryOpen ? (
          <div
            className="fixed inset-0 z-40 flex flex-col bg-app
              pt-[max(0.75rem,env(safe-area-inset-top))]
              pb-[max(0.75rem,env(safe-area-inset-bottom))]
              pl-[max(0.9rem,env(safe-area-inset-left))]
              pr-[max(0.9rem,env(safe-area-inset-right))]
              lg:pointer-events-none lg:absolute lg:inset-auto lg:top-0 lg:right-0 lg:bottom-0 lg:z-20
              lg:max-w-[calc(100%-1rem)] lg:bg-transparent lg:pt-4 lg:pb-4 lg:pr-4 lg:pl-0"
          >
            <div className="flex h-full min-h-0 w-full flex-col lg:pointer-events-auto lg:ml-auto lg:w-auto">
              <SessionInsightsPanel
                turns={detail!.turns}
                onCollapse={() => setSummaryOpen(false)}
              />
            </div>
          </div>
        ) : null}

        {!settingsOpen ? (
          <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center">
            <div className="pointer-events-auto w-max max-w-[calc(100%-2rem)] sm:max-w-[calc(100%-3rem)]">
              <div className="flex flex-col items-center gap-7 sm:gap-10">
                <div className="relative flex flex-col items-center">
                  <p className="absolute bottom-full left-1/2 mb-8 -translate-x-1/2 select-none whitespace-nowrap pl-[0.65em] text-center text-[10px] font-normal tracking-[0.65em] text-app-subtle">
                    KIVO
                  </p>

                  <OrbVisualizer
                    sessionTitle={detail?.session.title}
                    resume={Boolean(detail && detail.session.turnCount > 0)}
                  />
                </div>

                {MEETING_BOT_ENABLED ? (
                  <div className="flex flex-col items-center gap-5">
                    <div className="inline-flex items-center rounded-full border border-app-strong bg-app p-0.5 text-[10px] tracking-[0.18em]">
                      <button
                        type="button"
                        onClick={() => setMeetingMode(false)}
                        disabled={botActive}
                        className={`rounded-full px-4 py-1.5 transition-colors disabled:opacity-40 ${
                          !meetingModeActive
                            ? "bg-accent text-accent-fg"
                            : "text-app-subtle hover:text-app-secondary"
                        }`}
                      >
                        IN PERSON
                      </button>
                      <button
                        type="button"
                        onClick={() => setMeetingMode(true)}
                        disabled={micLive}
                        className={`rounded-full px-4 py-1.5 transition-colors disabled:opacity-40 ${
                          meetingModeActive
                            ? "bg-accent text-accent-fg"
                            : "text-app-subtle hover:text-app-secondary"
                        }`}
                      >
                        MEETING
                      </button>
                    </div>

                    {meetingModeActive ? (
                      <MeetingBotControls
                        sessionId={selectedSessionId}
                        botId={detail?.session.botId ?? null}
                        botStatus={detail?.session.botStatus ?? null}
                        disabled={detail?.session.status === "archived"}
                        ensureSession={ensureSession}
                        onChanged={handleSessionActivity}
                      />
                    ) : (
                      <Controls
                        sessionId={selectedSessionId}
                        disabled={detail?.session.status === "archived"}
                        resume={Boolean(detail && detail.session.turnCount > 0)}
                        ensureSession={ensureSession}
                        onActivity={handleSessionActivity}
                      />
                    )}
                  </div>
                ) : (
                  <Controls
                    sessionId={selectedSessionId}
                    disabled={detail?.session.status === "archived"}
                    resume={Boolean(detail && detail.session.turnCount > 0)}
                    ensureSession={ensureSession}
                    onActivity={handleSessionActivity}
                  />
                )}
                <UsageMeter />
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
