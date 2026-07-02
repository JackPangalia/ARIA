"use client";

import { useEffect, useRef, useState } from "react";
import { AriaEngine } from "@/lib/audio/aria-engine";
import { track } from "@/lib/analytics/client";
import { warmComposioTools } from "@/lib/composio/client-api";
import { ConfirmDialog } from "@/components/sessions/ConfirmDialog";
import type { SessionDoc, TranscriptionMode } from "@/lib/sessions/types";
import { useAriaStore } from "@/lib/store";

const CONSENT_ACK_KEY = "kivo_consent_ack";

function hasConsentAck(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_ACK_KEY) === "1";
  } catch {
    return true; // No storage — don't hard-block; the in-session notice remains.
  }
}

function browserUnsupportedMessage(): string | null {
  if (typeof navigator === "undefined") return null;
  const hasMic = Boolean(navigator.mediaDevices?.getUserMedia);
  const hasAudio =
    typeof window.AudioContext !== "undefined" ||
    "webkitAudioContext" in window;
  if (hasMic && hasAudio) return null;
  return "Kivo needs microphone access this browser doesn't support. Please use a recent version of Chrome, Edge, Safari, or Firefox.";
}

export function Controls(props: {
  sessionId: string | null;
  transcriptionMode: TranscriptionMode;
  disabled?: boolean;
  resume?: boolean;
  ensureSession?: () => Promise<SessionDoc>;
  onActivity?: () => void;
}) {
  const {
    sessionId,
    transcriptionMode,
    disabled,
    resume,
    ensureSession,
    onActivity,
  } = props;
  const status = useAriaStore((s) => s.status);
  const engineRef = useRef<AriaEngine | null>(null);
  const prevSessionIdRef = useRef(sessionId);
  const [busy, setBusy] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);

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
    const unsupported = browserUnsupportedMessage();
    if (unsupported) {
      useAriaStore.getState().setError(unsupported);
      return;
    }
    if (!hasConsentAck()) {
      setConsentOpen(true);
      return;
    }
    await beginSession();
  };

  const beginSession = async () => {
    setBusy(true);
    try {
      let activeSessionId = sessionId;
      let activeTranscriptionMode = transcriptionMode;
      if (!activeSessionId) {
        if (!ensureSession) return;
        const session = await ensureSession();
        activeSessionId = session.id;
        activeTranscriptionMode = session.transcriptionMode;
      }
      const engine = new AriaEngine({
        sessionId: activeSessionId,
        transcriptionMode: activeTranscriptionMode,
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
      track("session_start");
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
      <ConfirmDialog
        open={consentOpen}
        title="Before Kivo starts listening"
        description="Kivo transcribes everything your microphone hears, including other people. Make sure everyone present knows the conversation is being transcribed and consents — some places legally require it."
        confirmLabel="Everyone knows — start"
        cancelLabel="Not yet"
        onConfirm={() => {
          try {
            window.localStorage.setItem(CONSENT_ACK_KEY, "1");
          } catch {
            // Storage unavailable — they'll see the dialog again next time.
          }
          setConsentOpen(false);
          void beginSession();
        }}
        onCancel={() => setConsentOpen(false)}
      />
      {isRunning ? (
        <p className="text-center text-[11px] text-app-muted">
          Transcribing — all voices in range are captured.
        </p>
      ) : null}
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
