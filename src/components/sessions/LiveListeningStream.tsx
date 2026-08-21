"use client";

import { useEffect, useRef } from "react";
import type { TranscriptLine } from "@/lib/sessions/live-transcript";

function lineLabel(line: TranscriptLine): string {
  if (line.role === "assistant") return "Kivo";
  return (
    line.speakerName ??
    (line.speaker != null ? `Speaker ${line.speaker + 1}` : "Other speaker")
  );
}

/**
 * Live transcript that sits above the listening orb — newest speech at the
 * bottom, pinned to the live edge unless the reader has scrolled up.
 */
export function LiveListeningStream(props: { lines: TranscriptLine[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !pinnedRef.current) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [props.lines]);

  return (
    <div
      ref={scrollerRef}
      className="pointer-events-auto absolute inset-0 overflow-y-auto px-6 sm:px-10 lg:px-16"
      aria-live="polite"
      aria-relevant="additions text"
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 2rem, black 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 2rem, black 100%)",
      }}
      onScroll={(event) => {
        const el = event.currentTarget;
        pinnedRef.current =
          el.scrollHeight - el.scrollTop - el.clientHeight < 96;
      }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-end gap-5 pb-[min(13.5rem,42vmin)] pt-8 sm:gap-6 sm:pt-10">
        {props.lines.map((line) => {
          const asked = line.role === "user_question";
          const kivo = line.role === "assistant";
          if (asked) {
            return (
              <div key={line.id} className="flex justify-end pl-10 sm:pl-16">
                <p
                  className={`max-w-[min(100%,36rem)] rounded-[1.35rem] bg-surface px-4 py-2.5 text-[15px] leading-relaxed text-app sm:text-base ${
                    line.isPartial ? "text-app-muted" : ""
                  }`}
                >
                  {line.text}
                  {line.isPartial ? (
                    <span className="ml-1 inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-app-muted" />
                  ) : null}
                </p>
              </div>
            );
          }
          return (
            <div key={line.id} className="flex flex-col items-start">
              <p className="mb-1 text-[13px] font-medium text-app-muted">
                {lineLabel(line)}
              </p>
              <p
                className={`text-[15px] leading-relaxed sm:text-base ${
                  kivo
                    ? "text-app"
                    : line.isPartial
                      ? "text-app-muted"
                      : "text-app-secondary"
                }`}
              >
                {line.text}
                {line.isPartial ? (
                  <span className="ml-1 inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-app-muted" />
                ) : null}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
