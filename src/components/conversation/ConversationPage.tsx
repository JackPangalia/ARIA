"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEducationAnchor } from "@/components/education/EducationProvider";
import type { SpeakerCorrectionProps } from "@/components/sessions/SessionInsightsPanel";
import type { NotesEditorProps } from "@/components/notes/NotesEditor";
import { notesHtmlToMarkdown } from "@/lib/notes/sanitize-html";
import type {
  NotesDocKind,
  SessionNotesController,
} from "@/lib/notes/use-session-notes";
import type { PrivateChatController } from "@/lib/private-chat/use-private-chat";
import type { TranscriptLine } from "@/lib/sessions/live-transcript";
import type { MeetingSummaryDoc, SessionDoc } from "@/lib/sessions/types";
import type { LiveAnswer } from "@/lib/store";
import type { AriaStatus } from "@/lib/types";
import { AskKivoPanel } from "./AskKivoPanel";
import { ConversationBar } from "./ConversationBar";
import { EnhancedNotesView } from "./EnhancedNotesView";
import { LiveAnswerPanel } from "./LiveAnswerPanel";
import { TranscriptPanel } from "./TranscriptPanel";
import "./conversation-page.css";

export type ConversationPanel = "transcript" | "chat" | null;

const NotesEditor = dynamic<NotesEditorProps>(
  () => import("@/components/notes/NotesEditor"),
  {
    ssr: false,
    loading: () => <div className="kivo-conv-editor-loading" aria-hidden />,
  }
);

function TranscriptIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 6.5h14M5 12h14M5 17.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16h-5.5L7 19.5V16a2.5 2.5 0 0 1-2.5-2.5v-7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8" y="8" width="11" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

async function copyToClipboard(html: string) {
  const markdown = notesHtmlToMarkdown(html);
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([markdown], { type: "text/plain" }),
        }),
      ]);
      return;
    }
  } catch {
    // Fall through to the plain-text path.
  }
  await navigator.clipboard.writeText(markdown);
}

function downloadMarkdown(title: string, html: string) {
  const markdown = `# ${title}\n\n${notesHtmlToMarkdown(html)}\n`;
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title.replace(/[\\/:*?"<>|]+/g, "-").trim() || "notes"}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SaveStatus(props: {
  notes: SessionNotesController;
  kind: NotesDocKind;
}) {
  const state = props.kind === "personal" ? props.notes.personal : props.notes.enhanced;
  switch (state.saveState) {
    case "dirty":
      return <span className="kivo-conv-save">Unsaved changes</span>;
    case "saving":
      return <span className="kivo-conv-save">Saving…</span>;
    case "saved":
      return <span className="kivo-conv-save is-saved">Saved</span>;
    case "error":
      return (
        <span className="kivo-conv-save is-error" role="status">
          Couldn&rsquo;t save
          <button type="button" onClick={() => props.notes.retrySave(props.kind)} className="kivo-conv-link">
            Retry
          </button>
        </span>
      );
    case "conflict":
      return (
        <span className="kivo-conv-save is-error" role="status">
          Changed elsewhere
          <button type="button" onClick={() => props.notes.resolveConflict(props.kind, "theirs")} className="kivo-conv-link">
            Reload
          </button>
          <button type="button" onClick={() => props.notes.resolveConflict(props.kind, "mine")} className="kivo-conv-link">
            Keep mine
          </button>
        </span>
      );
    default:
      return null;
  }
}

export function ConversationPage(props: {
  session: SessionDoc;
  meetingSummary: MeetingSummaryDoc | null;
  transcriptLines: TranscriptLine[];
  speakerCorrection?: SpeakerCorrectionProps;
  notes: SessionNotesController;
  chat: PrivateChatController;
  docView: NotesDocKind;
  onChangeDocView: (kind: NotesDocKind) => void;
  panel: ConversationPanel;
  onChangePanel: (panel: ConversationPanel) => void;
  status: AriaStatus;
  notice: string | null;
  isRunning: boolean;
  busy: boolean;
  elapsedMs: number;
  liveAnswer: LiveAnswer | null;
  canSilence: boolean;
  onStart: () => void;
  onStop: () => void;
  onStopSpeaking: () => void;
  onGenerateEnhanced: () => void;
}) {
  const { notes, session } = props;
  const archived = session.status === "archived";
  const [copied, setCopied] = useState(false);
  const [dismissedAnswerId, setDismissedAnswerId] = useState<string | null>(null);
  const overviewAnchor = useEducationAnchor<HTMLDivElement>("overview");
  const panelRef = useRef<HTMLElement>(null);

  const activeHtml =
    props.docView === "personal" ? notes.personal.draft : notes.enhanced.draft;
  const activeHasContent = notesHtmlToMarkdown(activeHtml).length > 0;

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(activeHtml);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [activeHtml]);

  // Escape closes the side panel; the editor keeps every other key to itself.
  useEffect(() => {
    if (!props.panel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        props.onChangePanel(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.panel, props.onChangePanel, props]);

  const showLiveAnswer =
    props.liveAnswer !== null &&
    props.liveAnswer.id !== dismissedAnswerId &&
    (props.isRunning || props.liveAnswer.text.length > 0);

  const enhancedStatus = notes.enhanced.doc.status;
  const enhancedReady = enhancedStatus === "ready" && Boolean(notes.enhanced.doc.content);
  const canGenerate =
    !archived &&
    notes.loaded &&
    !notes.generating &&
    (session.turnCount > 0 || notesHtmlToMarkdown(notes.personal.draft).length > 0);

  const panelToggle = (panel: Exclude<ConversationPanel, null>) =>
    props.onChangePanel(props.panel === panel ? null : panel);

  return (
    <div className="kivo-conv" data-panel={props.panel ?? "none"}>
      <header className="kivo-conv-head">
        <div ref={overviewAnchor} className="kivo-conv-switcher" role="tablist" aria-label="Document">
          <button
            type="button"
            role="tab"
            aria-selected={props.docView === "personal"}
            aria-controls="kivo-conv-doc"
            onClick={() => props.onChangeDocView("personal")}
            className={`kivo-conv-tab ${props.docView === "personal" ? "is-active" : ""}`}
          >
            My notes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={props.docView === "enhanced"}
            aria-controls="kivo-conv-doc"
            onClick={() => props.onChangeDocView("enhanced")}
            className={`kivo-conv-tab ${props.docView === "enhanced" ? "is-active" : ""} ${
              enhancedReady ? "" : "is-muted"
            }`}
          >
            Enhanced
            {notes.generating || enhancedStatus === "generating" ? (
              <span className="kivo-conv-tab-dot is-busy" aria-label="Writing" />
            ) : enhancedReady ? (
              <span className="kivo-conv-tab-dot" aria-hidden />
            ) : null}
          </button>
        </div>
        <div className="kivo-conv-head-status">
          <SaveStatus notes={notes} kind={props.docView} />
        </div>
        <div className="kivo-conv-head-actions">
          <button
            type="button"
            onClick={() => panelToggle("transcript")}
            aria-pressed={props.panel === "transcript"}
            className={`kivo-conv-action ${props.panel === "transcript" ? "is-active" : ""}`}
          >
            <TranscriptIcon />
            <span>Transcript</span>
          </button>
          <button
            type="button"
            onClick={() => panelToggle("chat")}
            aria-pressed={props.panel === "chat"}
            className={`kivo-conv-action ${props.panel === "chat" ? "is-active" : ""}`}
          >
            <ChatIcon />
            <span>Ask Kivo</span>
          </button>
          <span className="kivo-conv-head-divider" aria-hidden />
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={!activeHasContent}
            className="kivo-conv-action is-quiet"
            aria-label={copied ? "Copied" : "Copy notes"}
            title="Copy"
          >
            <CopyIcon />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            onClick={() => downloadMarkdown(session.title, activeHtml)}
            disabled={!activeHasContent}
            className="kivo-conv-action is-quiet"
            aria-label="Export notes as Markdown"
            title="Export as Markdown"
          >
            <ExportIcon />
            <span>Export</span>
          </button>
        </div>
      </header>

      <div className="kivo-conv-body">
        <main id="kivo-conv-doc" className="kivo-conv-doc" role="tabpanel">
          <div className="kivo-conv-doc-inner">
            {notes.loadError ? (
              <p className="kivo-conv-doc-error" role="alert">
                {notes.loadError}{" "}
                <button type="button" onClick={() => void notes.reload()} className="kivo-conv-link">
                  Retry
                </button>
              </p>
            ) : null}
            {props.docView === "personal" ? (
              notes.loaded ? (
                <NotesEditor
                  key={`personal-${session.id}`}
                  content={notes.personal.draft}
                  resetToken={notes.personal.resetToken}
                  onChange={(html) => notes.setDraft("personal", html)}
                  placeholder="Write anything you want to remember…"
                  editable={!archived}
                  autoFocus={!props.isRunning && session.turnCount === 0}
                  ariaLabel="My notes"
                />
              ) : (
                <div className="kivo-conv-editor-loading" aria-busy="true" />
              )
            ) : (
              <EnhancedNotesView
                key={`enhanced-${session.id}`}
                notes={notes}
                summary={props.meetingSummary}
                Editor={NotesEditor}
                canGenerate={canGenerate}
                onGenerate={props.onGenerateEnhanced}
              />
            )}
          </div>
        </main>

        {props.panel ? (
          <aside
            ref={panelRef}
            className="kivo-conv-panel"
            aria-label={props.panel === "transcript" ? "Transcript" : "Ask Kivo"}
          >
            {props.panel === "transcript" ? (
              <TranscriptPanel
                lines={props.transcriptLines}
                isRunning={props.isRunning}
                speakerCorrection={props.speakerCorrection}
                onClose={() => props.onChangePanel(null)}
              />
            ) : (
              <AskKivoPanel
                chat={props.chat}
                disabled={archived}
                onClose={() => props.onChangePanel(null)}
              />
            )}
          </aside>
        ) : null}
      </div>

      {showLiveAnswer && props.liveAnswer ? (
        <LiveAnswerPanel
          answer={props.liveAnswer}
          status={props.status}
          canSilence={props.canSilence}
          onStopSpeaking={props.onStopSpeaking}
          onDismiss={() => setDismissedAnswerId(props.liveAnswer?.id ?? null)}
        />
      ) : null}

      <ConversationBar
        status={props.status}
        isRunning={props.isRunning}
        busy={props.busy}
        elapsedMs={props.elapsedMs}
        archived={archived}
        resume={session.turnCount > 0}
        canSilence={props.canSilence}
        notice={props.notice}
        onStart={props.onStart}
        onStop={props.onStop}
        onStopSpeaking={props.onStopSpeaking}
      />
    </div>
  );
}
