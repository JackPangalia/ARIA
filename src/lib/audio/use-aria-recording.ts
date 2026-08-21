"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AriaEngine } from "@/lib/audio/aria-engine";
import { track } from "@/lib/analytics/client";
import { warmComposioTools } from "@/lib/composio/client-api";
import { CONNECTORS_ENABLED } from "@/lib/features";
import { generateMeetingSummary } from "@/lib/sessions/client";
import type { SessionDoc, TranscriptionMode } from "@/lib/sessions/types";
import { useAriaStore } from "@/lib/store";
import type { SessionSpeakerClusterSnapshot } from "@/lib/speakers/session-learning";

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

export interface UseAriaRecordingInput {
  sessionId: string | null;
  transcriptionMode: TranscriptionMode;
  ensureSession?: () => Promise<SessionDoc>;
  onActivity?: () => void;
}

export interface AriaRecording {
  isRunning: boolean;
  busy: boolean;
  /** Milliseconds since the mic went live; the single clock voice + chat share. */
  elapsedMs: number;
  /** Ephemeral stream-scoped voiceprints available for explicit transcript tags. */
  speakerClusters: SessionSpeakerClusterSnapshot[];
  consentOpen: boolean;
  requestStart: () => Promise<void>;
  stop: () => Promise<void>;
  stopSpeaking: () => boolean;
  confirmConsent: () => void;
  cancelConsent: () => void;
}

/**
 * Owns the `AriaEngine` lifecycle at a level that outlives the voice/chat view.
 * Previously this lived inside the voice-only `Controls`, so switching to chat
 * unmounted it and stopped the mic mid-meeting. Held here (in the always-mounted
 * workspace), recording is independent of which modality is on screen — the
 * engine is only torn down when the workspace unmounts or the session changes.
 */
export function useAriaRecording(input: UseAriaRecordingInput): AriaRecording {
  const status = useAriaStore((s) => s.status);
  const engineRef = useRef<AriaEngine | null>(null);
  const prevSessionIdRef = useRef(input.sessionId);
  const inputRef = useRef(input);
  inputRef.current = input;

  const [busy, setBusy] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [speakerClusters, setSpeakerClusters] = useState<
    SessionSpeakerClusterSnapshot[]
  >([]);

  const isRunning = status !== "idle" && status !== "error";

  useEffect(() => {
    return () => {
      void engineRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = input.sessionId;
    if (prev !== input.sessionId && prev !== null) {
      void engineRef.current?.stop();
      engineRef.current = null;
      setSpeakerClusters([]);
    }
  }, [input.sessionId]);

  // The one recording clock. Stamped when the mic goes live; the interval ticks
  // `now` each second so elapsed is a pure render-time subtraction.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!isRunning) {
      setStartedAt(null);
      return;
    }
    const started = Date.now();
    setStartedAt(started);
    setNow(started);
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);
  const elapsedMs = startedAt != null ? Math.max(0, now - startedAt) : 0;

  const beginSession = useCallback(async () => {
    setBusy(true);
    try {
      const { sessionId, transcriptionMode, ensureSession, onActivity } =
        inputRef.current;

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
      setSpeakerClusters([]);
      await engine.start();
      track("session_start");
      if (CONNECTORS_ENABLED) {
        void warmComposioTools().catch(() => {
          // Best-effort prefetch before first wake question.
        });
      }
    } catch {
      engineRef.current = null;
    } finally {
      setBusy(false);
    }
  }, []);

  const requestStart = useCallback(async () => {
    if (isRunning || busy) return;
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
  }, [isRunning, busy, beginSession]);

  const stop = useCallback(async () => {
    if (!isRunning && !engineRef.current) return;
    setBusy(true);
    try {
      const clusters = await engineRef.current?.stop();
      setSpeakerClusters(clusters ?? []);
      engineRef.current = null;
      // Best-effort: generate the Overview tab's meeting summary before
      // refreshing detail, so it's ready the moment the stop button clears.
      const sessionId = inputRef.current.sessionId;
      if (sessionId) {
        await generateMeetingSummary(sessionId).catch(() => undefined);
      }
      inputRef.current.onActivity?.();
    } finally {
      setBusy(false);
    }
  }, [isRunning]);

  const stopSpeaking = useCallback(
    () => engineRef.current?.stopSpeaking() ?? false,
    []
  );

  const confirmConsent = useCallback(() => {
    try {
      window.localStorage.setItem(CONSENT_ACK_KEY, "1");
    } catch {
      // Storage unavailable — they'll see the dialog again next time.
    }
    setConsentOpen(false);
    void beginSession();
  }, [beginSession]);

  const cancelConsent = useCallback(() => setConsentOpen(false), []);

  return {
    isRunning,
    busy,
    elapsedMs,
    speakerClusters,
    consentOpen,
    requestStart,
    stop,
    stopSpeaking,
    confirmConsent,
    cancelConsent,
  };
}
