"use client";

import { useEffect, useRef, useState } from "react";
import { AriaEngine } from "@/lib/audio/aria-engine";
import { useAriaStore } from "@/lib/store";

export function Controls(props: {
  sessionId: string;
  disabled?: boolean;
  onActivity?: () => void;
}) {
  const { sessionId, disabled, onActivity } = props;
  const status = useAriaStore((s) => s.status);
  const engineRef = useRef<AriaEngine | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      void engineRef.current?.stop();
    };
  }, []);

  const isRunning = status !== "idle" && status !== "error";

  const onStart = async () => {
    if (disabled || isRunning || busy) return;
    setBusy(true);
    try {
      const engine = new AriaEngine({ sessionId, onSessionActivity: onActivity });
      engineRef.current = engine;
      await engine.start();
    } catch {
      engineRef.current = null;
    } finally {
      setBusy(false);
    }
  };

  const onStop = async () => {
    if (!isRunning && !engineRef.current) return;
    setBusy(true);
    try {
      await engineRef.current?.stop();
      engineRef.current = null;
      onActivity?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full max-w-[19rem] flex-col items-center gap-5">
      {disabled ? (
        <p className="text-center text-xs text-app-muted">
          This session is archived. Resume an active session to listen again.
        </p>
      ) : null}

      {isRunning ? (
        <button
          type="button"
          onClick={onStop}
          disabled={busy}
          className="inline-flex min-w-[8.5rem] items-center justify-center rounded-full border border-app-strong bg-app px-8 py-3 text-sm font-semibold tracking-[0.12em] text-app transition-colors hover:border-app-strong hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          STOP
        </button>
      ) : (
        <button
          type="button"
          onClick={onStart}
          disabled={busy || disabled}
          className="inline-flex min-w-[8.5rem] items-center justify-center rounded-full bg-accent px-8 py-3 text-sm font-semibold tracking-[0.12em] text-accent-fg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          START
        </button>
      )}
    </div>
  );
}
