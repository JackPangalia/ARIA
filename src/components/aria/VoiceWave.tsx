"use client";

import { useAriaStore } from "@/lib/store";
import type { AriaStatus } from "@/lib/types";

const BAR_COUNT = 8;

function waveMode(status: AriaStatus): "idle" | "listen" | "wake" | "think" | "speak" {
  if (status === "idle" || status === "error") return "idle";
  if (status === "speaking") return "speak";
  if (status === "thinking") return "think";
  if (status === "capturing-question") return "wake";
  return "listen";
}

export function VoiceWave() {
  const status = useAriaStore((s) => s.status);
  const micLevel = useAriaStore((s) => s.micLevel);
  const error = useAriaStore((s) => s.errorMessage);

  const mode = waveMode(status);
  const active = mode !== "idle";

  let scale = 1;
  if (mode === "listen" || mode === "wake") {
    // When idle/quiet, scale is small so bars look mostly flat.
    // Scales up rapidly as micLevel increases.
    scale = 0.05 + Math.min(1.15, micLevel * 8);
  }

  const idle = mode === "idle";

  const barColor =
    mode === "speak"
      ? "bg-purple-500 dark:bg-purple-400"
      : mode === "think"
        ? "bg-blue-500 dark:bg-blue-400"
        : mode === "wake"
          ? "bg-amber-400 dark:bg-amber-400"
          : mode === "listen"
            ? "bg-emerald-500 dark:bg-emerald-500"
            : "";

  const animClass =
    mode === "speak" || mode === "think"
      ? "voice-bar-speak"
      : mode === "listen" || mode === "wake"
        ? "voice-bar-listen"
        : "";

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="flex h-20 items-end justify-center gap-1.5"
        style={{
          transform: idle ? undefined : `scaleY(${scale})`,
          transition: idle ? undefined : "transform 72ms ease-out",
        }}
        role="img"
        aria-label={
          mode === "speak"
            ? "ARIA is speaking"
            : mode === "wake"
              ? "Hey ARIA — waiting or thinking"
              : mode === "listen"
                ? "Listening to microphone"
                : status === "error"
                  ? "Error"
                  : "Idle"
        }
      >
        {idle ? (
          <>
            {Array.from({ length: BAR_COUNT }).map((_, i) => (
              <span
                key={i}
                className="block w-2 rounded-full bg-zinc-400/45 dark:bg-zinc-600/45"
                style={{ height: 8 }}
              />
            ))}
          </>
        ) : (
          <>
            {Array.from({ length: BAR_COUNT }).map((_, i) => {
              const stagger = i * 45;
              const durationJitter = 0.28 + (i % 4) * 0.06;
              return (
                <span
                  key={i}
                  className={`voice-bar block w-2 rounded-full will-change-transform ${barColor} ${animClass}`}
                  style={{
                    height: 56,
                    animationDelay: `${stagger}ms`,
                    animationDuration:
                      mode === "speak"
                        ? `${0.62 + (i % 3) * 0.12}s`
                        : `${0.38 + durationJitter}s`,
                  }}
                />
              );
            })}
          </>
        )}
      </div>
      {error && (
        <p className="max-w-sm text-center text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
