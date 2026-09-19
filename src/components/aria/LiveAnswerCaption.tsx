"use client";

import { modeFor, statusLabelFor } from "@/components/aria/visual-state";
import { SimpleMarkdown } from "@/components/sessions/SimpleMarkdown";
import type { LiveAnswer } from "@/lib/store";
import type { AriaStatus } from "@/lib/types";

/**
 * What Kivo heard and what it is saying, under the orb. Stays a caption —
 * the orb is still the page.
 */
export function LiveAnswerCaption(props: {
  answer: LiveAnswer;
  status: AriaStatus;
}) {
  const mode = modeFor(props.status);
  const working = mode === "think" || mode === "search" || mode === "speak";

  return (
    <section
      className="kivo-live-caption"
      aria-live="polite"
      aria-label="Kivo's spoken answer"
    >
      {props.answer.question ? (
        <p className="kivo-live-caption-heard">{props.answer.question}</p>
      ) : null}
      {props.answer.text ? (
        <div className="kivo-live-caption-answer">
          <SimpleMarkdown text={props.answer.text} />
        </div>
      ) : working ? (
        <p className="kivo-live-caption-wait">
          {statusLabelFor(props.status)}
          {mode !== "speak" ? <span className="orb-ellipsis">…</span> : null}
        </p>
      ) : null}
    </section>
  );
}
