"use client";

import { useEffect, useRef, useState } from "react";
import type { TranscriptLine } from "@/lib/sessions/live-transcript";
import {
  SpeakerLabelMenu,
  type SpeakerCorrectionProps,
} from "./SpeakerLabelMenu";

export type { SpeakerCorrectionProps };

const LABEL_GUTTER = "5.25rem";
const LABEL_GAP = "0.75rem";
const PANEL_WIDTH = "17rem";
const TEXT_OFFSET = `calc(${LABEL_GUTTER} + ${LABEL_GAP})`;

/** Reserved width on the right when the transcript is open (labels + text + padding). */
export const TRANSCRIPT_RESERVE_WIDTH = `calc(${PANEL_WIDTH} + ${TEXT_OFFSET})`;

function ChevronLeftDouble({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
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
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M3 8h5M3 12h5M3 16h5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <rect
        x="13"
        y="4"
        width="8"
        height="16"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
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
  return (
    line.speakerName ??
    (line.speaker != null ? `Speaker ${line.speaker + 1}` : "Other speaker")
  );
}

// Deterministic hue per speaker name so each person keeps a consistent avatar
// color across renders (mirrors SpeakerProfilesManager's avatarHue).
function speakerHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function SpeakerAvatar({ line }: { line: TranscriptLine }) {
  const isKivo = line.role === "assistant";
  const label = turnLabel(line);
  return (
    <span
      aria-hidden
      className={`kivo-speaker-avatar ${
        line.isPartial ? "animate-pulse" : ""
      }`}
      style={
        isKivo
          ? { background: "var(--app-fg)", color: "var(--app-bg)" }
          : {
              background: `hsl(${speakerHue(label)} 34% 52%)`,
              color: "white",
            }
      }
    >
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
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

export function SessionInsightsPanel(props: {
  lines: TranscriptLine[];
  onCollapse?: () => void;
  speakerCorrection?: SpeakerCorrectionProps;
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
          <span className="text-xs font-medium text-app-muted">Transcript</span>
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
        <TranscriptLines
          lines={props.lines}
          gutter
          speakerCorrection={props.speakerCorrection}
        />
        <div ref={endRef} className="h-px shrink-0" aria-hidden />
      </div>
    </div>
  );
}

export function TranscriptLines(props: {
  lines: TranscriptLine[];
  gutter?: boolean;
  large?: boolean;
  speakerCorrection?: SpeakerCorrectionProps;
}) {
  const [openMenuLineId, setOpenMenuLineId] = useState<string | null>(null);
  const bodyTextClass = props.large
    ? "text-[15px] leading-relaxed"
    : "text-sm leading-[1.65]";
  const labelTextClass = props.large
    ? "text-[13px] font-medium"
    : "text-xs font-medium";

  if (props.lines.length === 0) {
    return (
      <p
        className={`py-6 font-normal leading-relaxed text-app-muted ${bodyTextClass} ${
          props.gutter
            ? "px-1 lg:ml-[calc(5.25rem+0.75rem)] lg:w-[17rem] lg:px-0"
            : "px-1"
        }`}
      >
        No transcript yet. Start listening and lines will appear here.
      </p>
    );
  }

  return (
    <ul
      className={`w-full ${props.large ? "kivo-transcript-list" : "space-y-4 px-1 pb-2 lg:space-y-3.5 lg:px-0"}`}
    >
      {props.lines.map((line) => {
        // Questions asked aloud are correctable too: they are the same person
        // in the same room, just persisted by the ask pipeline rather than the
        // transcript path.
        //
        // A cluster key means the correction can retrain the voiceprint and
        // sweep every line from that cluster. Without one we can still fix the
        // name on this single line — which is the only option for question
        // turns persisted before they carried a diarization label, and they
        // are otherwise stranded wrong forever. A typed chat question has
        // neither a label nor a speaker name, so it stays uncorrectable.
        const correctable =
          props.speakerCorrection != null &&
          (line.role === "speaker" || line.role === "user_question") &&
          (line.speakerClusterKey != null || line.speakerName != null);
        const labelContent = (
          <span className="truncate">{turnLabel(line)}</span>
        );
        return (
          <li
            key={line.id}
            className={
              props.large
                ? "kivo-transcript-line"
                : props.gutter
                  ? "flex w-full flex-col items-start gap-1 lg:flex-row lg:items-baseline lg:gap-3"
                  : "flex items-baseline gap-2 px-0.5"
            }
          >
            <span
              className={`flex max-w-full items-center gap-1.5 leading-[1.5] ${
                props.large
                  ? "kivo-transcript-speaker"
                  : `${labelTextClass} ${
                      line.role === "assistant"
                        ? "text-app-secondary"
                        : "text-app-muted"
                    }`
              } ${
                props.large
                  ? ""
                  : props.gutter
                    ? "justify-start lg:w-[5.25rem] lg:shrink-0 lg:justify-end"
                    : "w-[4rem] shrink-0 justify-end"
              }`}
              title={turnLabel(line)}
            >
              {correctable ? (
                <SpeakerLabelMenu
                  line={line}
                  correction={props.speakerCorrection!}
                  open={openMenuLineId === line.id}
                  onToggle={() =>
                    setOpenMenuLineId((current) =>
                      current === line.id ? null : line.id,
                    )
                  }
                  onClose={() => setOpenMenuLineId(null)}
                >
                  {labelContent}
                </SpeakerLabelMenu>
              ) : (
                labelContent
              )}
            </span>
            <p
              className={`w-full min-w-0 font-normal break-words ${
                props.large
                  ? "kivo-transcript-copy"
                  : `${bodyTextClass} ${
                      line.role === "assistant"
                        ? "text-app"
                        : line.isPartial
                          ? "text-app-muted"
                          : "text-app-secondary"
                    } ${props.gutter ? "lg:w-[17rem] lg:shrink-0" : "flex-1"}`
              }`}
            >
              {line.text}
              {line.isPartial ? (
                <span className="ml-1 inline-block h-3 w-px translate-y-0.5 animate-pulse bg-app-muted" />
              ) : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
