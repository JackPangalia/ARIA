"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { TurnDoc } from "@/lib/sessions/types";

const LABEL_GUTTER = "5.25rem";
const PANEL_WIDTH = "17rem";

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function turnLabel(turn: TurnDoc): string {
  if (turn.role === "assistant") return "ARIA";
  if (turn.role === "user_question") {
    return turn.speaker == null
      ? "Q"
      : turn.speakerName ?? `Speaker ${turn.speaker + 1}`;
  }
  return turn.speakerName ?? (turn.speaker == null ? "Speaker" : `Speaker ${turn.speaker + 1}`);
}

export function SessionInsightsPanel(props: {
  turns: TurnDoc[];
  onClose?: () => void;
  floating?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const floating = props.floating ?? false;
  const lastTurnId = props.turns[props.turns.length - 1]?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lastTurnId, props.turns.length]);

  if (!floating) {
    return (
      <aside className="flex h-full min-h-0 w-full flex-col bg-app px-4 py-5">
        <TranscriptLines turns={props.turns} endRef={endRef} />
      </aside>
    );
  }

  return (
    <div
      className="relative flex h-full min-h-0"
      style={{ width: `calc(${PANEL_WIDTH} + ${LABEL_GUTTER} + 0.75rem)` }}
    >
      <div
        className="pointer-events-none absolute top-0 right-0 bottom-0 rounded-2xl bg-app/80 shadow-menu backdrop-blur-sm"
        style={{ width: PANEL_WIDTH }}
        aria-hidden
      />

      {props.onClose ? (
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Hide transcript"
          className="absolute top-0 right-0 z-10 rounded-md p-1.5 text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary"
        >
          <CloseIcon />
        </button>
      ) : null}

      <div className="relative z-[1] flex h-full min-h-0 flex-col pt-8">
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <TranscriptLines turns={props.turns} endRef={endRef} gutter />
        </div>
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
