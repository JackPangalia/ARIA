"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  deleteProjectSource,
  listProjectSources,
  uploadProjectSource,
} from "@/lib/projects/client";
import { PROJECT_SOURCES_TOKEN_BUDGET } from "@/lib/sessions/constants";
import type { ProjectDoc, ProjectSourceDoc } from "@/lib/projects/types";
import type { SessionDoc } from "@/lib/sessions/types";
import {
  FileIcon,
  HubEmptyState,
  HubRowsSkeleton,
  PlusIcon,
  SearchIcon,
  SessionIcon,
  TextIcon,
  TrashIcon,
  UploadIcon,
} from "./icons";
import { sessionPrefetchProps } from "@/lib/sessions/detail-cache";
import "./project-hub.css";

function formatSessionDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type HubTab = "sessions" | "sources";
type AddSourceMode = "choose" | "text";

const PAGE_SIZE = 15;

export function ProjectHubView(props: {
  project: ProjectDoc;
  sessions: SessionDoc[];
  onOpenSearch: () => void;
  onSelectSession: (sessionId: string) => void;
}) {
  const [tab, setTab] = useState<HubTab>("sessions");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sources, setSources] = useState<ProjectSourceDoc[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceModalMode, setSourceModalMode] = useState<AddSourceMode>("choose");
  const [dragActive, setDragActive] = useState(false);
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!sourceModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSourceModal();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sourceModalOpen]);

  useEffect(() => {
    let cancelled = false;
    setSourcesLoading(true);
    setSourceError(null);
    void listProjectSources(props.project.id)
      .then((next) => {
        if (!cancelled) setSources(next);
      })
      .catch((error) => {
        if (!cancelled) {
          setSourceError(error instanceof Error ? error.message : "Failed to load sources.");
        }
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [props.project.id]);

  const sortedSessions = useMemo(
    () =>
      [...props.sessions].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [props.sessions]
  );

  const paginatedSessions = useMemo(
    () => sortedSessions.slice(0, visibleCount),
    [sortedSessions, visibleCount]
  );

  const usedSourceTokens = useMemo(
    () => sources.reduce((sum, source) => sum + source.tokenEstimate, 0),
    [sources]
  );

  const sourceUsagePercent = Math.min(
    100,
    Math.round((usedSourceTokens / PROJECT_SOURCES_TOKEN_BUDGET) * 100)
  );

  const refreshSources = async () => {
    const next = await listProjectSources(props.project.id);
    setSources(next);
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    const [file] = Array.from(files);
    if (!file || sourceBusy) return;
    setSourceBusy(true);
    setSourceError(null);
    try {
      const created = await uploadProjectSource(props.project.id, { file });
      setSources((current) => [created, ...current]);
      setSourceModalOpen(false);
      setSourceModalMode("choose");
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setSourceBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (modalFileInputRef.current) modalFileInputRef.current.value = "";
    }
  };

  const handleUploadPaste = async () => {
    if (!pasteText.trim() || sourceBusy) return;
    setSourceBusy(true);
    setSourceError(null);
    try {
      const created = await uploadProjectSource(props.project.id, {
        text: pasteText,
        name: pasteName || "Text source",
      });
      setSources((current) => [created, ...current]);
      setPasteName("");
      setPasteText("");
      setSourceModalOpen(false);
      setSourceModalMode("choose");
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setSourceBusy(false);
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (sourceBusy) return;
    setSourceBusy(true);
    setSourceError(null);
    try {
      await deleteProjectSource(props.project.id, sourceId);
      setSources((current) => current.filter((source) => source.id !== sourceId));
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : "Delete failed.");
      await refreshSources().catch(() => undefined);
    } finally {
      setSourceBusy(false);
    }
  };

  const closeSourceModal = () => {
    setSourceModalOpen(false);
    setSourceModalMode("choose");
    setDragActive(false);
  };

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "text-app"
        : "text-app-subtle hover:text-app-secondary"
    }`;

  return (
    <div className="kivo-project-hub pointer-events-auto flex h-full min-h-0 min-w-0 w-full flex-col">
      <div className="kivo-project-hub-scroll min-h-0 flex-1 overflow-y-auto">
        <div>
          <div>
            <button
              type="button"
              onClick={props.onOpenSearch}
              className="kivo-project-search group flex w-full items-center gap-2.5 rounded-xl border border-app-subtle px-4 py-3 text-left text-sm text-app-muted transition-[background-color,border-color,transform] hover:-translate-y-px hover:border-app hover:bg-surface-hover hover:text-app-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app"
            >
              <SearchIcon className="shrink-0 text-app-muted transition-colors group-hover:text-app-secondary" />
              <span className="min-w-0 flex-1 truncate text-sm font-normal">Search conversations</span>
              <kbd className="hidden rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-app-subtle sm:inline">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="kivo-project-tabs mt-7 flex items-center gap-1 border-b border-app-subtle pb-1">
            <button type="button" onClick={() => setTab("sessions")} aria-pressed={tab === "sessions"} className={tabClass(tab === "sessions")}>
              Conversations ({sortedSessions.length})
            </button>
            <button type="button" onClick={() => setTab("sources")} aria-pressed={tab === "sources"} className={tabClass(tab === "sources")}>
              Sources ({sources.length})
            </button>
          </div>

          {tab === "sessions" ? (
            <div key="sessions" className="kivo-fade-in mt-5">
              {sortedSessions.length === 0 ? (
                <HubEmptyState
                  icon={<SessionIcon size={20} />}
                  title="No conversations yet"
                  description="Conversations in this project will appear here."
                />
              ) : (
                <div className="space-y-3">
                  <ul className="kivo-project-session-list">
                    {paginatedSessions.map((session) => (
                      <li key={session.id}>
                        <button
                          type="button"
                          onClick={() => props.onSelectSession(session.id)}
                          {...sessionPrefetchProps(session.id)}
                          className="kivo-project-session-row group flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-app"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <SessionIcon className="shrink-0 text-app-muted transition-colors group-hover:text-app" />
                            <span className="truncate text-sm font-medium text-app">{session.title}</span>
                          </div>
                          <span className="shrink-0 text-xs text-app-subtle">
                            {formatSessionDate(session.updatedAt)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>

                  {sortedSessions.length > paginatedSessions.length ? (
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs text-app-subtle">
                        Showing {paginatedSessions.length} of {sortedSessions.length} conversations
                      </span>
                      <button
                        type="button"
                        onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
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
          ) : (
            <div key="sources" className="kivo-fade-in mt-5 space-y-5">
              {sourceError ? (
                <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
                  {sourceError}
                </div>
              ) : null}

              {sourcesLoading ? (
                <HubRowsSkeleton rows={3} />
              ) : (
                <ul className="space-y-0.5">
                  <li>
                    <button
                      type="button"
                      onClick={() => setSourceModalOpen(true)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-normal text-app-secondary transition-colors hover:bg-surface-hover hover:text-app"
                    >
                      <PlusIcon className="shrink-0 text-app-muted" />
                      <span>Add sources</span>
                    </button>
                  </li>
                  {sources.length > 0 ? (
                    <li className="px-3 py-1" role="separator" aria-hidden>
                      <div className="border-t border-app" />
                    </li>
                  ) : null}
                  {sources.map((source) => (
                    <li
                      key={source.id}
                      className="group flex items-center gap-2 rounded-xl px-3 py-3 transition-colors hover:bg-surface-hover"
                    >
                      <FileIcon className="shrink-0 text-app-muted" />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-app">{source.name}</p>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSource(source.id)}
                        disabled={sourceBusy}
                        aria-label={`Delete ${source.name}`}
                        className="shrink-0 rounded-lg p-2 text-app-muted opacity-100 transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40 lg:opacity-0 lg:group-hover:opacity-100"
                      >
                        <TrashIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {sources.length > 0 ? (
                <div className="rounded-2xl bg-surface/60 px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-app-secondary">Sources</span>
                    <span className="text-app-subtle">
                      {usedSourceTokens.toLocaleString()} / {PROJECT_SOURCES_TOKEN_BUDGET.toLocaleString()} tokens
                    </span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-accent transition-[width]"
                      style={{ width: `${sourceUsagePercent}%` }}
                    />
                  </div>
                  <p className="mt-2.5 text-xs text-app-subtle">
                    Sources are included in every Kivo answer inside this project.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {sourceModalOpen && mounted
        ? createPortal(
            <div className="fixed inset-0 z-[280] isolate flex items-center justify-center bg-overlay px-4">
              <button
                type="button"
                aria-label="Close"
                className="absolute inset-0"
                onClick={closeSourceModal}
              />
              <div className="relative w-full max-w-md rounded-2xl bg-app p-3 shadow-menu">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-sm font-medium text-app">Add sources</h2>
                  <button
                    type="button"
                    onClick={closeSourceModal}
                    className="rounded-lg px-2 py-1 text-sm text-app-muted transition-colors hover:bg-surface-hover hover:text-app"
                  >
                    Close
                  </button>
                </div>

                {sourceModalMode === "text" ? (
                  <div className="rounded-2xl bg-surface/60 p-4">
                    <input
                      value={pasteName}
                      onChange={(event) => setPasteName(event.target.value)}
                      placeholder="Source name"
                      className="w-full rounded-xl bg-surface px-3 py-2 text-sm text-app outline-none focus:bg-surface-hover"
                    />
                    <textarea
                      value={pasteText}
                      onChange={(event) => setPasteText(event.target.value)}
                      rows={7}
                      placeholder="Paste source text..."
                      className="mt-3 w-full resize-none rounded-xl bg-surface px-3 py-2 text-sm text-app outline-none focus:bg-surface-hover"
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setSourceModalMode("choose")}
                        className="rounded-xl px-3 py-2 text-sm text-app-muted transition-colors hover:bg-surface-hover hover:text-app"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUploadPaste()}
                        disabled={sourceBusy || !pasteText.trim()}
                        className="rounded-xl bg-accent px-4 py-2 text-sm text-accent-fg transition-opacity disabled:opacity-40"
                      >
                        Add text
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setDragActive(true);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragActive(false);
                        void handleUploadFiles(event.dataTransfer.files);
                      }}
                      className={`flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-10 text-center transition-colors ${
                        dragActive
                          ? "border-app-strong bg-surface-hover"
                          : "border-app bg-surface/60"
                      }`}
                    >
                      <UploadIcon className="text-app-muted" />
                      <p className="mt-3 text-sm text-app">Drag sources here</p>
                      <p className="mt-1 text-xs text-app-subtle">
                        PDF, Word, Markdown, text, CSV, JSON, and code files
                      </p>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => modalFileInputRef.current?.click()}
                        disabled={sourceBusy}
                        className="flex min-h-20 flex-col items-center justify-center rounded-xl bg-surface px-3 py-4 text-xs text-app-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                      >
                        <UploadIcon className="mb-2 text-app-muted" />
                        Upload
                      </button>
                      <button
                        type="button"
                        onClick={() => setSourceModalMode("text")}
                        disabled={sourceBusy}
                        className="flex min-h-20 flex-col items-center justify-center rounded-xl bg-surface px-3 py-4 text-xs text-app-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                      >
                        <TextIcon className="mb-2 text-app-muted" />
                        Text input
                      </button>
                      <input
                        ref={modalFileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,.js,.jsx,.ts,.tsx,.py,.swift,.html,.css,.sql,.yaml,.yml,text/*,application/pdf,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(event) => {
                          if (event.target.files) {
                            void handleUploadFiles(event.target.files);
                          }
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
