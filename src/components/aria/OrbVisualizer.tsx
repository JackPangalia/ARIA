"use client";

import { GlowOrb } from "@/components/aria/GlowOrb";
import { modeFor } from "@/components/aria/visual-state";
import { useAriaStore } from "@/lib/store";

export function OrbVisualizer(props: {
  /** Tap the idle orb to begin recording; omitted when it can't be started. */
  onActivate?: () => void;
}) {
  const status = useAriaStore((s) => s.status);
  const error = useAriaStore((s) => s.errorMessage);
  const notice = useAriaStore((s) => s.notice);

  const mode = modeFor(status);
  const idle = mode === "idle";
  const hasMessage = Boolean(error || notice);

  return (
    <div
      className={`flex flex-col items-center ${hasMessage ? "gap-5 sm:gap-6" : ""}`}
    >
      <div
        className="group relative aspect-square w-[min(16.5rem,50vmin)] origin-center select-none max-sm:w-[min(14.5rem,70vw)]"
      >
        {idle && props.onActivate ? (
          <button
            type="button"
            onClick={props.onActivate}
            aria-label="Start recording"
            className="absolute inset-0 z-10 cursor-pointer rounded-full outline-none ring-app-muted/40 transition-shadow focus-visible:ring-2"
          />
        ) : null}
        <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.02]">
          <GlowOrb mode={mode} />
        </div>
      </div>

      {hasMessage ? (
        <div className="relative z-20 flex flex-col items-center gap-1">
          {error ? (
            <p className="max-w-xs text-center text-xs text-danger">
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
