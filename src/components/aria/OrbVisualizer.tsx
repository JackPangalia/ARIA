"use client";

import { OrbParticles } from "@/components/aria/OrbParticles";
import {
  accentFor,
  energyFor,
  modeFor,
} from "@/components/aria/visual-state";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useAriaStore } from "@/lib/store";

export function OrbVisualizer(props: {
  /** Tap the idle orb to begin recording; omitted when it can't be started. */
  onActivate?: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const status = useAriaStore((s) => s.status);
  const micLevel = useAriaStore((s) => s.micLevel);
  const error = useAriaStore((s) => s.errorMessage);
  const notice = useAriaStore((s) => s.notice);

  const mode = modeFor(status);
  const idle = mode === "idle";
  const isLight = resolvedTheme === "light";
  const accent = accentFor(mode, isLight);
  const energy = energyFor(mode, micLevel);
  const hasMessage = Boolean(error || notice);

  return (
    <div
      className={`flex flex-col items-center ${hasMessage ? "gap-6 sm:gap-8" : ""}`}
    >
      <div className="relative h-64 w-64 origin-center select-none max-sm:-my-5 max-sm:scale-[0.82]">
        {/* Tap the resting orb to begin — live status + Stop live in the
            top-bar recording strip once it's running. */}
        {idle && props.onActivate ? (
          <button
            type="button"
            onClick={props.onActivate}
            aria-label="Start recording"
            className="absolute inset-0 z-10 cursor-pointer rounded-full"
          />
        ) : null}
        {/* The canvas renders larger than this 256px box (with the camera pulled
            back to match, in OrbParticles) so the orb has transparent headroom
            to grow into when it's loud — otherwise the expanding particles get
            clipped at the frustum edge. */}
        <OrbParticles
          className="pointer-events-none absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2"
          color={accent}
          energy={energy}
          isLight={isLight}
        />
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
