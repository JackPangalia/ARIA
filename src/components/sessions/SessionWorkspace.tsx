"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controls } from "@/components/aria/Controls";
import { OrbVisualizer } from "@/components/aria/OrbVisualizer";
import { SessionActionsMenu } from "@/components/sessions/SessionActionsMenu";
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
  summarizeSession,
} from "@/lib/sessions/client";
import { useSessionStore } from "@/lib/sessions/session-store";
import { useAriaStore } from "@/lib/store";
import { orbCenterPositionClass } from "@/lib/orb-layout";
import {
  readSidebarCollapsed,
  storeSidebarCollapsed,
} from "@/lib/sidebar-layout";
import { SessionInsightsPanel } from "@/components/sessions/SessionInsightsPanel";

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
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(
    () => readSidebarCollapsed()
  );
  const ariaStatus = useAriaStore((state) => state.status);
  const bootstrappedRef = useRef(false);
  const searchDebounceRef = useRef<number | null>(null);

  const openSummaryPanel = useCallback(() => {
    setInsightsOpen(true);
  }, []);

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

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    storeSidebarCollapsed(collapsed);
  }, []);

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
      return next;
    },
    [setDetail]
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
        const nextSessions = await refreshSessions();
        const existingId = useSessionStore.getState().selectedSessionId;
        if (existingId) {
          await refreshDetail(existingId);
          setInsightsOpen(true);
          return;
        }

        const active = nextSessions.find((session) => session.status === "active");
        if (active) {
          setSelectedSessionId(active.id);
          await refreshDetail(active.id);
          setInsightsOpen(true);
          return;
        }

        const created = await createSession({ speakerCount: 2 });
        setSelectedSessionId(created.id);
        await refreshSessions();
        await refreshDetail(created.id);
        setInsightsOpen(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sessions.");
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshDetail, refreshSessions, setError, setLoading, setSelectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId || !LIVE_ARIA_STATUSES.has(ariaStatus)) return;

    const timer = window.setInterval(() => {
      void refreshDetail(selectedSessionId).catch(() => undefined);
    }, 8000);

    return () => window.clearInterval(timer);
  }, [LIVE_ARIA_STATUSES, ariaStatus, refreshDetail, selectedSessionId]);

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

  const handleCreateSession = async () => {
    setActionBusy(true);
    setError(null);
    try {
      const created = await createSession({ speakerCount: 2 });
      await refreshSessions(searchQuery);
      setSelectedSessionId(created.id);
      await refreshDetail(created.id);
      setSidebarOpen(false);
      openSummaryPanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session.");
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
      setSidebarOpen(false);
      openSummaryPanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleStatusChange = async (status: "ended" | "archived") => {
    if (!selectedSessionId || !detail) return;
    setActionBusy(true);
    try {
      const updated = await patchSession(selectedSessionId, { status });
      setDetail({ ...detail, session: updated });
      await refreshSessions(searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update session.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleExport = async (format: "markdown" | "json") => {
    if (!selectedSessionId) return;
    setActionBusy(true);
    try {
      const content = await exportSession(selectedSessionId, format);
      downloadText(
        `aria-session-${selectedSessionId}.${format === "json" ? "json" : "md"}`,
        content,
        format === "json" ? "application/json" : "text/markdown"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleSummarize = async () => {
    if (!selectedSessionId) return;
    setActionBusy(true);
    try {
      await summarizeSession(selectedSessionId);
      await refreshDetail(selectedSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summarization failed.");
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

  const gridClass = useMemo(() => {
    if (sidebarCollapsed) {
      return insightsOpen
        ? "lg:grid-cols-[minmax(0,1fr)_16rem]"
        : "grid-cols-1";
    }

    return insightsOpen
      ? "lg:grid-cols-[16rem_minmax(0,1fr)_16rem]"
      : "lg:grid-cols-[16rem_minmax(0,1fr)]";
  }, [insightsOpen, sidebarCollapsed]);

  if (loading && !detail) {
    return (
      <div className="flex h-dvh items-center justify-center bg-app text-app-muted">
        Loading sessions...
      </div>
    );
  }

  if (!selectedSessionId || !detail) {
    return (
      <div className="flex h-dvh items-center justify-center bg-app px-6 text-center text-app-muted">
        {error ?? "Unable to initialize session workspace."}
      </div>
    );
  }

  return (
    <div
      className={`grid h-dvh w-full grid-cols-1 overflow-hidden bg-app text-app ${gridClass}`}
    >
      {!sidebarCollapsed ? (
        <div className="hidden min-h-0 border-r border-app lg:block">
          <SessionSidebar
            sessions={filteredSessions}
            selectedSessionId={selectedSessionId}
            onOpenSearch={openSearch}
            onSelect={handleSelectSession}
            onCreate={handleCreateSession}
            onCollapse={() => setSidebarCollapsed(true)}
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
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-xs border-r border-app bg-app">
            <SessionSidebar
              sessions={filteredSessions}
              selectedSessionId={selectedSessionId}
              onOpenSearch={() => {
                setSidebarOpen(false);
                openSearch();
              }}
              onSelect={handleSelectSession}
              onCreate={handleCreateSession}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <SessionSearchModal
        open={searchOpen}
        query={searchQuery}
        sessions={filteredSessions}
        selectedSessionId={selectedSessionId}
        onQueryChange={handleSearch}
        onSelect={handleSelectSession}
        onClose={() => setSearchOpen(false)}
      />

      <section className="relative h-full min-h-0 min-w-0">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-start p-4">
          <div className="pointer-events-auto flex items-center gap-1 justify-self-start">
            {sidebarCollapsed ? (
              <SidebarExpandButton onClick={() => setSidebarCollapsed(false)} />
            ) : null}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg px-2 py-2 text-sm font-semibold text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary lg:hidden"
            >
              Sessions
            </button>
          </div>

          <div className="pointer-events-auto col-start-3 justify-self-end">
            <SessionActionsMenu
              busy={actionBusy}
              canEnd={detail.session.status !== "ended"}
              canArchive={detail.session.status !== "archived"}
              onSummarize={() => void handleSummarize()}
              onExportMarkdown={() => void handleExport("markdown")}
              onExportJson={() => void handleExport("json")}
              onEnd={() => void handleStatusChange("ended")}
              onArchive={() => void handleStatusChange("archived")}
              onOpenSearch={openSearch}
            />
          </div>
        </div>

        {error ? (
          <div className="absolute inset-x-4 top-16 z-10 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-danger">
            {error}
          </div>
        ) : null}

        <div className="absolute inset-0">
          <div
            className={`absolute w-max max-w-[calc(100%-3rem)] transition-all duration-300 ease-out ${orbCenterPositionClass("pane")}`}
          >
            <div className="flex flex-col items-center gap-10">
              <div className="relative flex flex-col items-center">
                <p className="absolute bottom-full left-1/2 mb-8 -translate-x-1/2 select-none whitespace-nowrap pr-[0.65em] text-center text-[10px] font-semibold tracking-[0.65em] text-app-subtle">
                  ARIA
                </p>

                <OrbVisualizer />
              </div>

              <Controls
                sessionId={selectedSessionId}
                disabled={detail.session.status === "archived"}
                onActivity={handleSessionActivity}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Right Column / Mobile Drawer for Session Insights */}
      {insightsOpen ? (
        <>
          <div className="hidden min-h-0 border-l border-app lg:block">
            <SessionInsightsPanel
              session={detail.session}
              summary={detail.summary}
              onClose={() => setInsightsOpen(false)}
            />
          </div>

          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close summary"
              className="absolute inset-0 bg-overlay"
              onClick={() => setInsightsOpen(false)}
            />
            <div className="absolute inset-y-0 right-0 w-[85%] max-w-xs border-l border-app bg-app">
              <SessionInsightsPanel
                session={detail.session}
                summary={detail.summary}
                onClose={() => setInsightsOpen(false)}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
