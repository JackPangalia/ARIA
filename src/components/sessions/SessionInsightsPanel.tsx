"use client";

import { useEffect, useRef } from "react";
import type { TranscriptLine } from "@/lib/sessions/live-transcript";

const LABEL_GUTTER = "5.25rem";
const LABEL_GAP = "0.75rem";
const PANEL_WIDTH = "17rem";
const TEXT_OFFSET = `calc(${LABEL_GUTTER} + ${LABEL_GAP})`;

/** Reserved width on the right when the transcript is open (labels + text + padding). */
export const TRANSCRIPT_RESERVE_WIDTH = `calc(${PANEL_WIDTH} + ${TEXT_OFFSET})`;

function ChevronLeftDouble({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11 17l-5-5 5-5M18 17l-5-5 5-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TranscriptExpandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 8h5M3 12h5M3 16h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <rect x="13" y="4" width="8" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

export function TranscriptExpandButton(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label="Expand transcript"
      className="rounded-lg p-2 text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary"
    >
      <TranscriptExpandIcon />
    </button>
  );
}

function turnLabel(line: TranscriptLine): string {
  if (line.role === "assistant") return "Kivo";
  if (line.role === "user_question") {
    return line.speakerName ?? "Other speaker";
  }
  return line.speakerName ?? "Other speaker";
}

// Deterministic hue per speaker name so each person keeps a consistent dot
// color across renders (mirrors SpeakerProfilesManager's avatarHue).
function speakerHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function SpeakerDot({ line }: { line: TranscriptLine }) {
  const isKivo = line.role === "assistant";
  return (
    <span
      aria-hidden
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
        isKivo ? "bg-accent" : line.isPartial ? "animate-pulse" : ""
      }`}
      style={
        isKivo
          ? undefined
          : { background: `hsl(${speakerHue(turnLabel(line))} 60% 55%)` }
      }
    />
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SessionInsightsPanel(props: {
  lines: TranscriptLine[];
  onCollapse?: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastLineId = props.lines[props.lines.length - 1]?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lastLineId, props.lines.length]);

  return (
    <div className="group relative flex h-full min-h-0 w-full flex-col lg:w-[var(--transcript-reserve)] [--transcript-reserve:calc(17rem+5.25rem+0.75rem)]">
      {/* Mobile: a real header bar with a tappable close control. */}
      {props.onCollapse ? (
        <div className="flex shrink-0 items-center justify-between px-1 pb-2 lg:hidden">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-app-muted">
            Transcript
          </span>
          <button
            type="button"
            onClick={props.onCollapse}
            aria-label="Close transcript"
            className="-mr-1.5 flex h-10 w-10 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary"
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}

      {/* Desktop: subtle hover-reveal collapse affordance. */}
      {props.onCollapse ? (
        <button
          type="button"
          onClick={props.onCollapse}
          aria-label="Collapse transcript"
          className="absolute top-0 left-0 z-10 hidden rounded-md p-1.5 text-app-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-surface-hover hover:text-app-secondary focus:opacity-100 focus:outline-none lg:block"
        >
          <ChevronLeftDouble />
        </button>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        <TranscriptLines lines={props.lines} gutter />
        <div ref={endRef} className="h-px shrink-0" aria-hidden />
      </div>
    </div>
  );
}

function TranscriptLines(props: {
  lines: TranscriptLine[];
  gutter?: boolean;
}) {
  if (props.lines.length === 0) {
    return (
      <p
        className={`py-6 text-sm font-normal leading-relaxed text-app-muted ${
          props.gutter ? "px-1 lg:ml-[calc(5.25rem+0.75rem)] lg:w-[17rem] lg:px-0" : "px-1"
        }`}
      >
        No transcript yet. Start listening and lines will appear here.
      </p>
    );
  }

  return (
    <ul className="w-full space-y-4 px-1 pb-2 lg:space-y-3.5 lg:px-0">
      {props.lines.map((line) => (
        <li
          key={line.id}
          className={
            props.gutter
              ? "flex w-full flex-col items-start gap-1 lg:flex-row lg:items-baseline lg:gap-3"
              : "flex items-baseline gap-2 px-0.5"
          }
        >
          <span
            className={`flex max-w-full items-center gap-1.5 text-xs font-medium leading-[1.5] ${
              line.role === "assistant" ? "text-app-secondary" : "text-app-muted"
            } ${
              props.gutter
                ? "justify-start lg:w-[5.25rem] lg:shrink-0 lg:justify-end"
                : "w-[4rem] shrink-0 justify-end"
            }`}
            title={turnLabel(line)}
          >
            <SpeakerDot line={line} />
            <span className="truncate">{turnLabel(line)}</span>
          </span>
          <p
            className={`w-full min-w-0 text-sm font-normal leading-[1.65] break-words ${
              line.role === "assistant"
                ? "text-app"
                : line.isPartial
                  ? "text-app-muted"
                  : "text-app-secondary"
            } ${props.gutter ? "lg:w-[17rem] lg:shrink-0" : "flex-1"}`}
          >
            {line.text}
            {line.isPartial ? (
              <span className="ml-1 inline-block h-3 w-px translate-y-0.5 animate-pulse bg-app-muted" />
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}
