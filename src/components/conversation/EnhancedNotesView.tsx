"use client";

import type { ComponentType } from "react";
import { Spinner } from "@/components/sessions/Loaders";
import type { NotesEditorProps } from "@/components/notes/NotesEditor";
import type { SessionNotesController } from "@/lib/notes/use-session-notes";
import type { MeetingSummaryDoc } from "@/lib/sessions/types";

function SparkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3.5 13.9 9.1 19.5 11l-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9L12 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Rows shaped like a notes document: a lead line, a heading, some bullets. */
function EnhancedSkeleton() {
  const rows: Array<{ label?: boolean; widths: string[] }> = [
    { widths: ["w-full", "w-10/12"] },
    { label: true, widths: ["w-11/12", "w-4/5", "w-3/5"] },
    { label: true, widths: ["w-5/6", "w-2/3"] },
  ];
  let index = 0;
  return (
    <div className="kivo-conv-enhanced-skeleton kivo-fade-in" aria-busy="true" aria-label="Writing enhanced notes">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="kivo-skeleton-wave space-y-3">
          {row.label ? (
            <div className="kivo-skeleton h-3.5 w-32 rounded-full" style={{ "--kivo-skeleton-index": index++ } as React.CSSProperties} />
          ) : null}
          {row.widths.map((width) => (
            <div key={width} className={`kivo-skeleton h-4 rounded-full ${width}`} style={{ "--kivo-skeleton-index": index++ } as React.CSSProperties} />
          ))}
        </div>
      ))}
    </div>
  );
}

function RecapFallback({ summary }: { summary: MeetingSummaryDoc }) {
  const section = (title: string, items: string[]) =>
    items.length > 0 ? (
      <section className="kivo-conv-recap-section">
        <h3>{title}</h3>
        <ul>
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </section>
    ) : null;
  return (
    <article className="kivo-conv-recap kivo-fade-in">
      <p className="kivo-conv-recap-lead">{summary.overview}</p>
      {section("Decisions", summary.decisions)}
      {section("Key points", summary.keyPoints)}
      {section("Action items", summary.actionItems)}
    </article>
  );
}

/**
 * The Enhanced document: Kivo's write-up once it exists, the older recap for
 * sessions that ended before enhanced notes existed, and the states in
 * between. Editable once ready, with the same autosave as personal notes.
 */
export function EnhancedNotesView(props: {
  notes: SessionNotesController;
  summary: MeetingSummaryDoc | null;
  Editor: ComponentType<NotesEditorProps>;
  canGenerate: boolean;
  onGenerate: () => void;
}) {
  const { notes } = props;
  const enhanced = notes.enhanced;
  const status = enhanced.doc.status;
  const generating = notes.generating || status === "generating";

  if (generating) {
    return (
      <div className="kivo-conv-enhanced-state">
        <p className="kivo-conv-enhanced-kicker">
          <Spinner className="h-3 w-3" /> Writing enhanced notes from your notes and the transcript
        </p>
        <EnhancedSkeleton />
      </div>
    );
  }

  if (status === "ready" && enhanced.doc.content) {
    return (
      <div className="kivo-conv-enhanced-ready">
        <div className="kivo-conv-enhanced-meta">
          <span>
            Written by Kivo from your notes and the room transcript
            {enhanced.doc.editedAt ? " · edited by you" : ""}.
          </span>
          {props.canGenerate ? (
            <button type="button" onClick={props.onGenerate} className="kivo-conv-link">
              Regenerate
            </button>
          ) : null}
        </div>
        {notes.generateError ? (
          <p className="kivo-conv-enhanced-error">
            Couldn&rsquo;t regenerate: {notes.generateError}
          </p>
        ) : null}
        <props.Editor
          content={enhanced.draft}
          resetToken={enhanced.resetToken}
          onChange={(html) => notes.setDraft("enhanced", html)}
          placeholder="Enhanced notes"
          ariaLabel="Enhanced notes"
        />
      </div>
    );
  }

  const error = status === "error" ? (enhanced.doc.error ?? notes.generateError) : notes.generateError;

  return (
    <div className="kivo-conv-enhanced-state">
      {props.summary ? (
        <>
          <p className="kivo-conv-enhanced-kicker">Recap from when this conversation ended</p>
          <RecapFallback summary={props.summary} />
        </>
      ) : (
        <div className="kivo-conv-enhanced-empty">
          <h2>Enhanced notes</h2>
          <p>
            {status === "empty"
              ? "There isn’t enough yet to write from. Add a few notes or let the room talk, then try again."
              : "When you end the conversation, Kivo rewrites your notes against everything that was said: gaps filled, shorthand expanded, action items pulled out. Your original notes stay as you wrote them."}
          </p>
        </div>
      )}
      {error ? <p className="kivo-conv-enhanced-error">{error}</p> : null}
      {props.canGenerate ? (
        <button type="button" onClick={props.onGenerate} className="kivo-conv-generate">
          <SparkIcon />
          <span>{error || status === "empty" ? "Try again" : "Write enhanced notes now"}</span>
        </button>
      ) : null}
    </div>
  );
}
