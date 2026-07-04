"use client";

import { useEffect, useRef, useState } from "react";
import type { TranscriptLine } from "@/lib/sessions/live-transcript";

/** Wiring for "that wasn't Jack" — offered on speaker lines while listening. */
export interface SpeakerCorrectionProps {
  enrolledNames: string[];
  onCorrect: (
    line: TranscriptLine,
    correctedName: string | null
  ) => void | Promise<void>;
}

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

function correctionChoices(
  line: TranscriptLine,
  enrolledNames: string[]
): Array<{ key: string; label: string; correctedName: string | null }> {
  const choices: Array<{
    key: string;
    label: string;
    correctedName: string | null;
  }> = enrolledNames
    .filter((name) => name !== line.speakerName)
    .map((name) => ({
      key: `name:${name}`,
      label: `This is ${name}`,
      correctedName: name,
    }));
  if (line.speakerName != null) {
    choices.push({
      key: "someone-else",
      label: "Someone else",
      correctedName: null,
    });
  }
  return choices;
}

function SpeakerLabelMenu(props: {
  line: TranscriptLine;
  correction: SpeakerCorrectionProps;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const choices = correctionChoices(props.line, props.correction.enrolledNames);
  if (choices.length === 0) return <>{props.children}</>;

  return (
    <span className="relative inline-flex max-w-full">
      <button
        type="button"
        onClick={props.onToggle}
        aria-label={`Correct speaker for this line (currently ${
          props.line.speakerName ?? "Other speaker"
        })`}
        className="inline-flex max-w-full items-center rounded-sm underline decoration-dotted decoration-app-subtle/60 underline-offset-4 transition-colors hover:text-app-secondary focus:outline-none focus-visible:text-app-secondary"
      >
        {props.children}
      </button>
      {props.open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={props.onClose}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div className="absolute left-0 top-full z-30 mt-1.5 w-max min-w-[9rem] overflow-hidden rounded-xl border border-app-strong bg-app py-1 shadow-lg">
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-app-subtle">
              Wrong speaker?
            </p>
            {choices.map((choice) => (
              <button
                key={choice.key}
                type="button"
                onClick={() => {
                  props.onClose();
                  void props.correction.onCorrect(
                    props.line,
                    choice.correctedName
                  );
                }}
                className="block w-full px-3 py-1.5 text-left text-xs normal-case tracking-normal text-app-secondary transition-colors hover:bg-surface-hover hover:text-app"
              >
                {choice.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </span>
  );
}

function TranscriptLines(props: {
  lines: TranscriptLine[];
  gutter?: boolean;
  speakerCorrection?: SpeakerCorrectionProps;
}) {
  const [openMenuLineId, setOpenMenuLineId] = useState<string | null>(null);

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
      {props.lines.map((line) => {
        const correctable =
          props.speakerCorrection != null &&
          line.role === "speaker" &&
          line.providerSpeakerLabel != null;
        const labelContent = (
          <>
            <SpeakerDot line={line} />
            <span className="truncate">{turnLabel(line)}</span>
          </>
        );
        return (
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
            {correctable ? (
              <SpeakerLabelMenu
                line={line}
                correction={props.speakerCorrection!}
                open={openMenuLineId === line.id}
                onToggle={() =>
                  setOpenMenuLineId((current) =>
                    current === line.id ? null : line.id
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
        );
      })}
    </ul>
  );
}
