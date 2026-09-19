"use client";

import { SimpleMarkdown } from "@/components/sessions/SimpleMarkdown";
import { modeFor, statusLabelFor } from "@/components/aria/visual-state";
import type { LiveAnswer } from "@/lib/store";
import type { AriaStatus } from "@/lib/types";

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="m4 4 8 8M12 4 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * What Kivo heard and what it is saying, as a compact caption above the
 * controls. Stays small on purpose: the notes are the page, this is a status.
 */
export function LiveAnswerPanel(props: {
  answer: LiveAnswer;
  status: AriaStatus;
  canSilence: boolean;
  onStopSpeaking: () => void;
  onDismiss: () => void;
}) {
  const mode = modeFor(props.status);
  const working = mode === "think" || mode === "search" || mode === "speak";
  const label = working ? statusLabelFor(props.status) : "Answered";

  return (
    <section className="kivo-conv-answer kivo-fade-in" aria-live="polite" aria-label="Kivo's spoken answer">
      <header className="kivo-conv-answer-head">
        <span className="kivo-conv-answer-heard">
          <span className="kivo-conv-answer-kicker">Heard</span>
          <span className="kivo-conv-answer-question">{props.answer.question}</span>
        </span>
        <span className="kivo-conv-answer-state" data-mode={mode}>
          {label}
          {working && mode !== "speak" ? <span className="orb-ellipsis">…</span> : null}
        </span>
        {props.canSilence ? (
          <button type="button" onClick={props.onStopSpeaking} className="kivo-conv-answer-stop">
            Stop answer
          </button>
        ) : (
          <button
            type="button"
            onClick={props.onDismiss}
            className="kivo-conv-answer-close"
            aria-label="Dismiss answer"
          >
            <CloseIcon />
          </button>
        )}
      </header>
      <div className="kivo-conv-answer-body">
        {props.answer.text ? (
          <SimpleMarkdown text={props.answer.text} />
        ) : (
          <span className="kivo-conv-answer-waiting">
            <span className="kivo-skeleton h-2 w-2 rounded-full" />
            {mode === "search" ? "Searching the web" : "Thinking"}
          </span>
        )}
      </div>
    </section>
  );
}
