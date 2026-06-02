"use client";

import { useEffect, useRef, useState } from "react";
import { AriaEngine } from "@/lib/audio/aria-engine";
import { warmComposioTools } from "@/lib/composio/client-api";
import { useAriaStore } from "@/lib/store";

export function Controls(props: {
  sessionId: string | null;
  disabled?: boolean;
  resume?: boolean;
  ensureSession?: () => Promise<string>;
  onActivity?: () => void;
}) {
  const { sessionId, disabled, resume, ensureSession, onActivity } = props;
  const status = useAriaStore((s) => s.status);
  const engineRef = useRef<AriaEngine | null>(null);
  const prevSessionIdRef = useRef(sessionId);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      void engineRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = sessionId;
    if (prev !== sessionId && prev !== null) {
      void engineRef.current?.stop();
      engineRef.current = null;
    }
  }, [sessionId]);

  const isRunning = status !== "idle" && status !== "error";

  const onStart = async () => {
    if (disabled || isRunning || busy) return;
    setBusy(true);
    try {
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        if (!ensureSession) return;
        activeSessionId = await ensureSession();
      }
      const engine = new AriaEngine({
        sessionId: activeSessionId,
        onSessionActivity: () => {
          onActivity?.();
          window.dispatchEvent(new Event("kivo:usage-refresh"));
        },
        onUsageExhausted: () => {
          window.dispatchEvent(new Event("kivo:usage-refresh"));
        },
      });
      engineRef.current = engine;
      await engine.start();
      void warmComposioTools().catch(() => {
        // Best-effort prefetch before first wake question.
      });
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
          className="inline-flex min-w-[9rem] items-center justify-center rounded-full border border-app-strong bg-app px-8 py-3 text-sm font-normal tracking-[0.12em] text-app transition-colors hover:border-app-strong hover:bg-surface-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          STOP
        </button>
      ) : resume ? (
        <button
          type="button"
          onClick={onStart}
          disabled={busy || disabled}
          className="inline-flex min-w-[9rem] items-center justify-center rounded-full bg-accent px-8 py-3 text-sm font-normal tracking-[0.12em] text-accent-fg transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Resume
        </button>
      ) : (
        <button
          type="button"
          onClick={onStart}
          disabled={busy || disabled}
          className="inline-flex min-w-[9rem] items-center justify-center rounded-full bg-accent px-8 py-3 text-sm font-normal tracking-[0.12em] text-accent-fg transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          START
        </button>
      )}
    </div>
  );
}
