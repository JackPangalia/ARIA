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
    return turn.speaker == null
      ? "Q"
      : turn.speakerName ?? `Speaker ${turn.speaker + 1}`;
  }
  return turn.speakerName ?? (turn.speaker == null ? "Speaker" : `Speaker ${turn.speaker + 1}`);
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
    <div
      className="group relative flex h-full min-h-0 flex-col"
      style={{ width: TRANSCRIPT_RESERVE_WIDTH }}
    >
      {props.onCollapse ? (
        <button
          type="button"
          onClick={props.onCollapse}
          aria-label="Collapse transcript"
          className="absolute top-0 left-0 z-10 rounded-md p-1.5 text-app-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-surface-hover hover:text-app-secondary focus:opacity-100 focus:outline-none"
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
          props.gutter ? "ml-[calc(5.25rem+0.75rem)] w-[17rem]" : "px-1"
        }`}
      >
        No transcript yet. Start listening and lines will appear here.
      </p>
    );
  }

  return (
    <ul className="space-y-3.5 pb-2">
      {props.turns.map((turn) => (
        <li
          key={turn.id}
          className={
            props.gutter
              ? "flex items-baseline gap-3"
              : "flex items-baseline gap-2 px-0.5"
          }
        >
          <span
            className={`shrink-0 text-right text-xs font-medium leading-[1.5] text-app-muted ${
              props.gutter ? "w-[5.25rem]" : "w-[3.5rem] truncate"
            }`}
            title={turnLabel(turn)}
          >
            {turnLabel(turn)}
          </span>
          <p
            className={`min-w-0 text-sm font-normal leading-[1.65] text-app break-words ${
              props.gutter ? "w-[17rem] shrink-0" : "flex-1"
            }`}
          >
            {turn.text}
          </p>
        </li>
      ))}
      <div ref={props.endRef} className="h-px shrink-0" aria-hidden />
    </ul>
  );
}
