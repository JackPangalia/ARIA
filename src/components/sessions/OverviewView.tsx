"use client";

import { useState } from "react";
import { MeetingChatPanel } from "@/components/sessions/MeetingChatPanel";
import { TranscriptLines } from "@/components/sessions/SessionInsightsPanel";
import type { TranscriptLine } from "@/lib/sessions/live-transcript";
import type { MeetingSummaryDoc, TurnDoc } from "@/lib/sessions/types";

type OverviewContentMode = "summary" | "transcript";

function ContentModeToggle(props: {
  mode: OverviewContentMode;
  onChange: (mode: OverviewContentMode) => void;
}) {
  const tabClass = (active: boolean) =>
    `rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
      active
        ? "bg-surface text-app"
        : "text-app-muted hover:bg-surface-hover hover:text-app-secondary"
    }`;

  return (
    <div
      role="tablist"
      aria-label="Overview content"
      className="mb-3 inline-flex items-center gap-0.5"
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-app-subtle">
      {children}
    </p>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2.5 space-y-2">
      {items.map((item, index) => (
        <li
          key={index}
          className="flex items-start gap-2.5 text-[15px] leading-relaxed text-app-secondary"
        >
          <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-app-subtle" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SummarySkeleton() {
  return (
    <div
      className="kivo-fade-in space-y-5"
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
        <div className="kivo-fade-in space-y-5">
          <p className="text-[17px] leading-[1.75] text-app sm:text-lg">
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
        <p className="text-center text-[15px] leading-relaxed text-app-muted">
          {props.isRunning
            ? "The summary appears here once you stop the recording."
            : "Not enough conversation yet to summarize."}
        </p>
      )}
    </div>
  );
}

/**
 * Overview tab — summary and transcript with a floating bottom chat dock.
 */
export function OverviewView(props: {
  sessionId: string;
  summary: MeetingSummaryDoc | null;
  transcriptLines: TranscriptLine[];
  turns: TurnDoc[];
  isRunning: boolean;
  generating: boolean;
  chatDisabled?: boolean;
  onRefreshChat: () => Promise<TurnDoc[]>;
  resumeLabel?: "RESUME" | "START";
  resumeBusy?: boolean;
  onResume?: () => void;
}) {
  const [contentMode, setContentMode] = useState<OverviewContentMode>("summary");

  return (
    <div className="kivo-overview-root flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-3 pb-6 sm:max-w-3xl sm:px-4 sm:pb-7">
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
            <div className="kivo-overview-surface pb-6 pt-0 sm:pb-7">
              <TranscriptLines lines={props.transcriptLines} large />
            </div>
          </div>
        </div>
      </div>

      <MeetingChatPanel
        key={props.sessionId}
        sessionId={props.sessionId}
        turns={props.turns}
        disabled={props.chatDisabled}
        onRefresh={props.onRefreshChat}
        resumeLabel={props.resumeLabel}
        resumeBusy={props.resumeBusy}
        resumeDisabled={props.chatDisabled}
        onResume={props.onResume}
      />
    </div>
  );
}
