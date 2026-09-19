"use client";

import {
  TranscriptLines,
  type SpeakerCorrectionProps,
} from "@/components/sessions/SessionInsightsPanel";
import { HubEmptyState, SessionIcon } from "@/components/sessions/icons";
import type { TranscriptLine } from "@/lib/sessions/live-transcript";
import type { MeetingSummaryDoc } from "@/lib/sessions/types";
import "./overview-header.css";

export type OverviewContentMode = "summary" | "transcript";

export function ContentModeToggle(props: {
  mode: OverviewContentMode;
  onChange: (mode: OverviewContentMode) => void;
  header?: boolean;
}) {
  const tabClass = (active: boolean) =>
    `kivo-overview-tab ${active ? "is-active" : ""}`;

  return (
    <div
      role="tablist"
      aria-label="Overview content"
      className={`kivo-overview-tabs ${props.header ? "kivo-overview-tabs--header" : ""}`}
    >
      <button
        id="overview-tab-summary"
        type="button"
        role="tab"
        aria-controls="overview-panel-summary"
        aria-selected={props.mode === "summary"}
        onClick={() => props.onChange("summary")}
        className={tabClass(props.mode === "summary")}
      >
        Summary
      </button>
      <button
        id="overview-tab-transcript"
        type="button"
        role="tab"
        aria-controls="overview-panel-transcript"
        aria-selected={props.mode === "transcript"}
        onClick={() => props.onChange("transcript")}
        className={tabClass(props.mode === "transcript")}
      >
        Transcript
      </button>
    </div>
  );
}

function EmptySessionPrompt(props: {
  resume: boolean;
  disabled: boolean;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <div className="flex max-w-xl flex-col items-start text-left">
      <p className="text-[2rem] font-medium leading-tight tracking-[-0.03em] text-app sm:text-[2.25rem]">
        {props.resume ? "Pick up where you left off" : "Ready when you are"}
      </p>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-app-muted">
        {props.resume
          ? "No summary or transcript yet. Resume listening and Kivo will pick up from here."
          : "Start a conversation and Kivo will listen, answer when you ask, and build a summary when you stop."}
      </p>
      <button
        type="button"
        onClick={props.onStart}
        disabled={props.busy || props.disabled}
        className="kivo-overview-start mt-8"
      >
        {props.disabled
          ? "Archived"
          : props.resume
            ? "Resume"
            : "Start conversation"}
      </button>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="kivo-summary-list">
      {items.map((item, index) => (
        <li key={index}>
          <span aria-hidden className="kivo-summary-bullet" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SummarySection(props: { title: string; items: string[] }) {
  if (props.items.length === 0) return null;
  return (
    <section className="kivo-summary-section">
      <h2>{props.title}</h2>
      <BulletList items={props.items} />
    </section>
  );
}

/** Placeholder rows sized like the real summary: one lead paragraph, then two
 * short titled lists. Matching the finished shape keeps the swap from shifting
 * the page around. */
const SUMMARY_SKELETON_BLOCKS: Array<{ label?: string; widths: string[] }> = [
  { widths: ["w-full", "w-11/12", "w-4/5", "w-2/3"] },
  { label: "w-24", widths: ["w-5/6", "w-3/4"] },
  { label: "w-28", widths: ["w-4/5", "w-2/3"] },
];

function SummarySkeleton() {
  let index = 0;
  return (
    <div
      className="kivo-fade-in kivo-summary-loading"
      aria-busy="true"
      aria-label="Writing summary"
    >
      {SUMMARY_SKELETON_BLOCKS.map((block, blockIndex) => (
        <div
          key={blockIndex}
          className={`kivo-skeleton-wave space-y-2.5 ${blockIndex > 0 ? "pt-1" : ""}`}
        >
          {block.label ? (
            <div
              className={`kivo-skeleton h-3 rounded-full ${block.label}`}
              style={
                { "--kivo-skeleton-index": index++ } as React.CSSProperties
              }
            />
          ) : null}
          {block.widths.map((width) => (
            <div
              key={width}
              className={`kivo-skeleton h-4 rounded-full ${width}`}
              style={
                { "--kivo-skeleton-index": index++ } as React.CSSProperties
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Placeholder rows sized like the real transcript: speaker label, then one
 * or two lines of copy. Matching the finished shape keeps the swap from
 * shifting the page around. */
const TRANSCRIPT_SKELETON_ROWS: Array<{ speaker: string; lines: string[] }> = [
  { speaker: "w-16", lines: ["w-11/12", "w-4/5"] },
  { speaker: "w-20", lines: ["w-full"] },
  { speaker: "w-14", lines: ["w-5/6", "w-2/3"] },
  { speaker: "w-[4.5rem]", lines: ["w-10/12"] },
  { speaker: "w-16", lines: ["w-4/5", "w-3/5"] },
];

function TranscriptSkeleton() {
  let index = 0;
  return (
    <div
      className="kivo-fade-in kivo-transcript-loading"
      aria-busy="true"
      aria-label="Writing transcript"
    >
      {TRANSCRIPT_SKELETON_ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="kivo-transcript-line">
          <div
            className={`kivo-skeleton h-3 rounded-full ${row.speaker}`}
            style={
              { "--kivo-skeleton-index": index++ } as React.CSSProperties
            }
          />
          <div className="kivo-skeleton-wave space-y-2.5">
            {row.lines.map((width) => (
              <div
                key={width}
                className={`kivo-skeleton h-4 rounded-full ${width}`}
                style={
                  { "--kivo-skeleton-index": index++ } as React.CSSProperties
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryCard(props: {
  summary: MeetingSummaryDoc | null;
  isRunning: boolean;
  generating: boolean;
}) {
  return (
    <div className="kivo-overview-surface">
      {props.generating ? (
        <SummarySkeleton />
      ) : props.summary ? (
        <article className="kivo-fade-in">
          <section className="kivo-summary-lead">
            <p>{props.summary.overview}</p>
          </section>

          <div className="kivo-summary-grid">
            <SummarySection title="Decisions" items={props.summary.decisions} />
            <SummarySection
              title="Key points"
              items={props.summary.keyPoints}
            />
            <SummarySection
              title="Action items"
              items={props.summary.actionItems}
            />
          </div>
        </article>
      ) : (
        <HubEmptyState
          icon={<SessionIcon size={20} />}
          title={props.isRunning ? "Still listening" : "No summary yet"}
          description={
            props.isRunning
              ? "The summary appears here once you stop the recording."
              : "Not enough conversation yet to summarize."
          }
        />
      )}
    </div>
  );
}

/**
 * Overview tab — summary and transcript.
 * Post-session text chat dock is parked (SESSION_CHAT_ENABLED).
 */
export function OverviewView(props: {
  summary: MeetingSummaryDoc | null;
  transcriptLines: TranscriptLine[];
  contentMode: OverviewContentMode;
  isRunning: boolean;
  generating: boolean;
  /** True when this session has prior turns (Resume vs Start). */
  resume: boolean;
  archived?: boolean;
  busy?: boolean;
  speakerCorrection?: SpeakerCorrectionProps;
  onStart: () => void;
}) {
  const isEmpty =
    !props.generating &&
    !props.isRunning &&
    !props.summary &&
    props.transcriptLines.length === 0;

  if (isEmpty) {
    return (
      <div className="kivo-overview-root pointer-events-auto flex h-full min-h-0 w-full flex-col overflow-hidden">
        <div className="kivo-overview-split">
          <div className="kivo-overview-pane is-active">
            <div className="kivo-overview-pane-scroll">
              <EmptySessionPrompt
                resume={props.resume}
                disabled={Boolean(props.archived)}
                busy={Boolean(props.busy)}
                onStart={props.onStart}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kivo-overview-root pointer-events-auto flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="kivo-overview-split">
        <section
          id="overview-panel-summary"
          aria-labelledby="overview-pane-summary-label"
          className={`kivo-overview-pane kivo-overview-pane--summary ${
            props.contentMode === "summary" ? "is-active" : ""
          }`}
        >
          <h2 id="overview-pane-summary-label" className="kivo-overview-pane-label">
            Summary
          </h2>
          <div className="kivo-overview-pane-scroll">
            <SummaryCard
              summary={props.summary}
              isRunning={props.isRunning}
              generating={props.generating}
            />
          </div>
        </section>
        <section
          id="overview-panel-transcript"
          aria-labelledby="overview-pane-transcript-label"
          className={`kivo-overview-pane kivo-overview-pane--transcript ${
            props.contentMode === "transcript" ? "is-active" : ""
          }`}
        >
          <h2
            id="overview-pane-transcript-label"
            className="kivo-overview-pane-label"
          >
            Transcript
          </h2>
          <div className="kivo-overview-pane-scroll">
            <div className="kivo-transcript-sheet">
              {props.generating ? (
                <TranscriptSkeleton />
              ) : (
                <div className="kivo-fade-in">
                  <TranscriptLines
                    lines={props.transcriptLines}
                    large
                    speakerCorrection={props.speakerCorrection}
                  />
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
