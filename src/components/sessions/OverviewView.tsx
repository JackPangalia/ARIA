"use client";

import { useState } from "react";
import { TranscriptLines } from "@/components/sessions/SessionInsightsPanel";
import type { TranscriptLine } from "@/lib/sessions/live-transcript";
import type { MeetingSummaryDoc } from "@/lib/sessions/types";

type OverviewContentMode = "summary" | "transcript";

function ContentModeToggle(props: {
  mode: OverviewContentMode;
  onChange: (mode: OverviewContentMode) => void;
}) {
  // Same pill tabs as the hub surfaces.
  const tabClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
      active
        ? "bg-surface text-app"
        : "text-app-muted hover:bg-surface-hover hover:text-app-secondary"
    }`;

  return (
    <div
      role="tablist"
      aria-label="Overview content"
      className="mb-5 flex items-center gap-1"
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
    <div className="flex flex-col items-center px-6 text-center">
      <p className="text-[15px] font-medium text-app">
        {props.resume ? "Pick up where you left off" : "Ready when you are"}
      </p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-app-muted">
        {props.resume
          ? "No summary or transcript yet. Resume listening and Kivo will pick up from here."
          : "Start a conversation and Kivo will listen, answer when you ask, and build a summary when you stop."}
      </p>
      <button
        type="button"
        onClick={props.onStart}
        disabled={props.busy || props.disabled}
        className="mt-6 px-1 py-1 text-[13px] font-medium text-app-muted transition-colors hover:text-app-secondary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {props.disabled ? "Archived" : props.resume ? "Resume" : "Start conversation"}
      </button>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 text-xs font-medium uppercase tracking-wider text-app-subtle">
      {children}
    </p>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5">
      {items.map((item, index) => (
        <li
          key={index}
          className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm leading-relaxed text-app-secondary transition-colors hover:bg-surface-hover"
        >
          <span aria-hidden className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-app-subtle" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SummarySkeleton() {
  return (
    <div
      className="kivo-fade-in space-y-5 px-1"
      aria-busy="true"
      aria-label="Generating summary"
    >
      <div className="space-y-2.5">
        <div className="kivo-skeleton h-4 w-full rounded-full" />
        <div className="kivo-skeleton h-4 w-11/12 rounded-full" />
        <div className="kivo-skeleton h-4 w-4/5 rounded-full" />
        <div className="kivo-skeleton h-4 w-2/3 rounded-full" />
      </div>
      <div className="space-y-2.5 pt-1">
        <div className="kivo-skeleton h-3 w-24 rounded-full" />
        <div className="kivo-skeleton h-4 w-5/6 rounded-full" />
        <div className="kivo-skeleton h-4 w-3/4 rounded-full" />
      </div>
      <div className="space-y-2.5 pt-1">
        <div className="kivo-skeleton h-3 w-28 rounded-full" />
        <div className="kivo-skeleton h-4 w-4/5 rounded-full" />
        <div className="kivo-skeleton h-4 w-2/3 rounded-full" />
      </div>
    </div>
  );
}

function SummaryCard(props: {
  summary: MeetingSummaryDoc | null;
  isRunning: boolean;
  generating: boolean;
}) {
  return (
    <div className="kivo-overview-surface pb-6 pt-0 sm:pb-7">
      {props.generating ? (
        <SummarySkeleton />
      ) : props.summary ? (
        <div className="kivo-fade-in space-y-7">
          <p className="px-1 text-[15px] leading-[1.7] text-app sm:leading-[1.75]">
            {props.summary.overview}
          </p>

          {props.summary.decisions.length > 0 ? (
            <div>
              <SectionLabel>Decisions</SectionLabel>
              <BulletList items={props.summary.decisions} />
            </div>
          ) : null}

          {props.summary.keyPoints.length > 0 ? (
            <div>
              <SectionLabel>Key points</SectionLabel>
              <BulletList items={props.summary.keyPoints} />
            </div>
          ) : null}

          {props.summary.actionItems.length > 0 ? (
            <div>
              <SectionLabel>Action items</SectionLabel>
              <BulletList items={props.summary.actionItems} />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="px-3 py-3 text-sm font-normal leading-relaxed text-app-subtle">
          {props.isRunning
            ? "The summary appears here once you stop the recording."
            : "Not enough conversation yet to summarize."}
        </p>
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
  isRunning: boolean;
  generating: boolean;
  /** True when this session has prior turns (Resume vs Start). */
  resume: boolean;
  archived?: boolean;
  busy?: boolean;
  onStart: () => void;
}) {
  const [contentMode, setContentMode] = useState<OverviewContentMode>("summary");
  const isEmpty =
    !props.generating &&
    !props.isRunning &&
    !props.summary &&
    props.transcriptLines.length === 0;

  if (isEmpty) {
    return (
      <div className="kivo-overview-root flex h-full min-h-0 w-full flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto">
          <EmptySessionPrompt
            resume={props.resume}
            disabled={Boolean(props.archived)}
            busy={Boolean(props.busy)}
            onStart={props.onStart}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="kivo-overview-root flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Same column, gutters and top offset as the hub surfaces. */}
        <div className="mx-auto w-full max-w-3xl px-6 pb-8 pt-6 sm:px-10 sm:pb-10 sm:pt-8">
          <ContentModeToggle mode={contentMode} onChange={setContentMode} />

          <div
            id="overview-panel-summary"
            role="tabpanel"
            aria-labelledby="overview-tab-summary"
            hidden={contentMode !== "summary"}
          >
            <SummaryCard
              summary={props.summary}
              isRunning={props.isRunning}
              generating={props.generating}
            />
          </div>
          <div
            id="overview-panel-transcript"
            role="tabpanel"
            aria-labelledby="overview-tab-transcript"
            hidden={contentMode !== "transcript"}
          >
            <div className="kivo-overview-surface px-1 pb-6 pt-0 sm:pb-7">
              <TranscriptLines lines={props.transcriptLines} large />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
