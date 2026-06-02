"use client";

import { useState } from "react";
import { sendMeetingBot, stopMeetingBot } from "@/lib/sessions/client";
import type { BotStatus } from "@/lib/sessions/types";

const STATUS_LABEL: Record<BotStatus, string> = {
  joining: "Kivo is joining the call…",
  live: "Kivo is in the call",
  ended: "Kivo left the call",
  error: "Bot error — try again",
};

const STATUS_DOT: Record<BotStatus, string> = {
  joining: "bg-amber-400 animate-pulse",
  live: "bg-emerald-400",
  ended: "bg-app-subtle",
  error: "bg-danger",
};

export function MeetingBotControls(props: {
  sessionId: string | null;
  botId: string | null;
  botStatus: BotStatus | null;
  disabled?: boolean;
  ensureSession?: () => Promise<string>;
  onChanged?: () => void;
}) {
  const { sessionId, botId, botStatus, disabled, ensureSession, onChanged } = props;
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = botStatus === "joining" || botStatus === "live";

  const onSend = async () => {
    if (busy || disabled) return;
    const meetingUrl = url.trim();
    if (!meetingUrl) return;
    setBusy(true);
    setError(null);
    try {
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        if (!ensureSession) return;
        activeSessionId = await ensureSession();
      }
      await sendMeetingBot(activeSessionId, meetingUrl);
      setUrl("");
      setOpen(false);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send Kivo.");
    } finally {
      setBusy(false);
    }
  };

  const onStop = async () => {
    if (busy || !sessionId || !botId) return;
    setBusy(true);
    setError(null);
    try {
      await stopMeetingBot(sessionId, botId);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove Kivo.");
    } finally {
      setBusy(false);
    }
  };

  if (active) {
    return (
      <div className="flex w-full max-w-[19rem] flex-col items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-app-strong bg-app px-4 py-1.5 text-xs text-app-secondary">
          <span
            className={`h-2 w-2 rounded-full ${STATUS_DOT[botStatus!]}`}
            aria-hidden
          />
          {STATUS_LABEL[botStatus!]}
        </div>
        <button
          type="button"
          onClick={onStop}
          disabled={busy}
          className="text-[11px] tracking-[0.12em] text-app-subtle underline-offset-4 transition-colors hover:text-app-secondary hover:underline disabled:opacity-40"
        >
          REMOVE FROM CALL
        </button>
        {error ? <p className="text-center text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[19rem] flex-col items-center gap-3">
      {open ? (
        <div className="flex w-full flex-col gap-2">
          <input
            type="url"
            inputMode="url"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onSend();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Paste a Zoom or Google Meet link"
            disabled={busy || disabled}
            className="w-full rounded-full border border-app-strong bg-app px-4 py-2.5 text-sm text-app placeholder:text-app-subtle focus:border-accent focus:outline-none disabled:opacity-40"
          />
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="rounded-full px-4 py-2 text-xs tracking-[0.12em] text-app-subtle transition-colors hover:text-app-secondary disabled:opacity-40"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={busy || disabled || url.trim().length === 0}
              className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-2 text-xs font-normal tracking-[0.12em] text-accent-fg transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "SENDING…" : "SEND KIVO"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="text-[11px] tracking-[0.18em] text-app-subtle underline-offset-4 transition-colors hover:text-app-secondary hover:underline disabled:opacity-40"
        >
          JOIN A ZOOM / MEET CALL
        </button>
      )}
      {error ? <p className="text-center text-xs text-danger">{error}</p> : null}
    </div>
  );
}
