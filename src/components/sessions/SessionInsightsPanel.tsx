"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { TurnDoc } from "@/lib/sessions/types";

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

function turnLabel(turn: TurnDoc): string {
  if (turn.role === "assistant") return "Kivo";
  if (turn.role === "user_question") {
    return turn.speakerName ?? "Other speaker";
  }
  return turn.speakerName ?? "Other speaker";
}

// Deterministic hue per speaker name so each person keeps a consistent dot
// color across renders (mirrors SpeakerProfilesManager's avatarHue).
function speakerHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function SpeakerDot({ turn }: { turn: TurnDoc }) {
  const isKivo = turn.role === "assistant";
  return (
    <span
      aria-hidden
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${isKivo ? "bg-accent" : ""}`}
      style={
        isKivo
          ? undefined
          : { background: `hsl(${speakerHue(turnLabel(turn))} 60% 55%)` }
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
  turns: TurnDoc[];
  onCollapse?: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastTurnId = props.turns[props.turns.length - 1]?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lastTurnId, props.turns.length]);

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
        <TranscriptLines turns={props.turns} endRef={endRef} gutter />
      </div>
    </div>
  );
}

function TranscriptLines(props: {
  turns: TurnDoc[];
  endRef: RefObject<HTMLDivElement | null>;
  gutter?: boolean;
}) {
  if (props.turns.length === 0) {
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
      {props.turns.map((turn) => (
        <li
          key={turn.id}
          className={
            props.gutter
              ? "flex w-full flex-col items-start gap-1 lg:flex-row lg:items-baseline lg:gap-3"
              : "flex items-baseline gap-2 px-0.5"
          }
        >
          <span
            className={`flex max-w-full items-center gap-1.5 text-xs font-medium leading-[1.5] ${
              turn.role === "assistant" ? "text-app-secondary" : "text-app-muted"
            } ${
              props.gutter
                ? "justify-start lg:w-[5.25rem] lg:shrink-0 lg:justify-end"
                : "w-[4rem] shrink-0 justify-end"
            }`}
            title={turnLabel(turn)}
          >
            <SpeakerDot turn={turn} />
            <span className="truncate">{turnLabel(turn)}</span>
          </span>
          <p
            className={`w-full min-w-0 text-sm font-normal leading-[1.65] break-words ${
              turn.role === "assistant" ? "text-app" : "text-app-secondary"
            } ${props.gutter ? "lg:w-[17rem] lg:shrink-0" : "flex-1"}`}
          >
            {turn.text}
          </p>
        </li>
      ))}
      <div ref={props.endRef} className="h-px shrink-0" aria-hidden />
    </ul>
  );
}
