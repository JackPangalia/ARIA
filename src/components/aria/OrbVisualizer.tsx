"use client";

import { useMemo } from "react";
import { WordRing } from "@/components/aria/WordRing";
import { modeFor } from "@/components/aria/visual-state";
import { useAriaStore } from "@/lib/store";
import {
  ringContentFor,
  ringTextFromUtterances,
} from "@/lib/voice/word-ring-text";

export function OrbVisualizer(props: {
  /** Tap the idle ring to begin recording; omitted when it can't be started. */
  onActivate?: () => void;
}) {
  const status = useAriaStore((s) => s.status);
  const utterances = useAriaStore((s) => s.utterances);
  const error = useAriaStore((s) => s.errorMessage);
  const notice = useAriaStore((s) => s.notice);

  const mode = modeFor(status);
  const idle = mode === "idle";
  const hasMessage = Boolean(error || notice);

  const liveText = useMemo(
    () => ringTextFromUtterances(utterances),
    [utterances],
  );

  // Going idle is the one thing that wipes the ring; while a session is live it
  // holds the last speech it heard through Kivo's own turns (see `WordRing`).
  const content = ringContentFor(mode, idle ? "" : liveText);

  return (
    <div
      className={`flex flex-col items-center ${hasMessage ? "gap-6 sm:gap-8" : ""}`}
    >
      <div className="group relative aspect-square w-[min(26rem,72vmin)] origin-center select-none max-sm:w-[min(22rem,86vw)]">
        {idle && props.onActivate ? (
          <button
            type="button"
            onClick={props.onActivate}
            aria-label="Start recording"
            className="absolute inset-0 z-10 cursor-pointer rounded-full outline-none ring-app-muted/40 transition-shadow focus-visible:ring-2"
          />
        ) : null}
        {/* The ring's own motion lives in transform, so the hover lift rides an
            outer box to keep the two from fighting for the same property. */}
        <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.015]">
          <WordRing text={content.text} voice={content.voice} mode={mode} />
        </div>
      </div>

      {hasMessage ? (
        <div className="relative z-20 flex flex-col items-center gap-1">
          {error ? (
            <p className="max-w-xs text-center text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          {!error && notice ? (
            <p
              className="max-w-xs text-center text-xs text-app-muted"
              aria-live="polite"
            >
              {notice}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
