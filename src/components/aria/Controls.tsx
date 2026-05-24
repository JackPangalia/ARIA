"use client";

import { useEffect, useRef, useState } from "react";
import { MeetingSizeControl } from "@/components/aria/MeetingSizeControl";
import {
  clampMeetingSpeakers,
  readStoredMeetingSpeakers,
  storeMeetingSpeakers,
} from "@/lib/audio/meeting-speakers";
import { AriaEngine } from "@/lib/audio/aria-engine";
import { useAriaStore } from "@/lib/store";

type SetupStep = "idle" | "speaker-count";

export function Controls() {
  const status = useAriaStore((s) => s.status);
  const engineRef = useRef<AriaEngine | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupStep, setSetupStep] = useState<SetupStep>("idle");
  const [meetingSpeakers, setMeetingSpeakers] = useState(
    readStoredMeetingSpeakers
  );

  useEffect(() => {
    return () => {
      void engineRef.current?.stop();
    };
  }, []);

  const isRunning = status !== "idle" && status !== "error";

  const onMeetingSpeakersChange = (count: number) => {
    const next = clampMeetingSpeakers(count);
    setMeetingSpeakers(next);
    storeMeetingSpeakers(next);
  };

  const onStart = async () => {
    if (isRunning || busy) return;
    setSetupStep("speaker-count");
  };

  const onContinue = async () => {
    if (isRunning || busy) return;
    setBusy(true);
    try {
      const engine = new AriaEngine();
      engineRef.current = engine;
      await engine.start(meetingSpeakers);
      setSetupStep("idle");
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
    } finally {
      setSetupStep("idle");
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full max-w-[19rem] flex-col items-center gap-5">
      {isRunning ? (
        <button
          type="button"
          onClick={onStop}
          disabled={busy}
          className="inline-flex min-w-[8.5rem] items-center justify-center rounded-full border border-zinc-700/80 bg-black px-8 py-3 text-sm font-medium tracking-[0.12em] text-zinc-100 transition-colors hover:border-zinc-400 hover:bg-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          STOP
        </button>
      ) : setupStep === "speaker-count" ? (
        <>
          <MeetingSizeControl
            value={meetingSpeakers}
            onChange={onMeetingSpeakersChange}
            disabled={busy}
          />
          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={() => setSetupStep("idle")}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center rounded-full border border-zinc-800 bg-black px-5 py-3 text-xs font-medium tracking-[0.16em] text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              BACK
            </button>
            <button
              type="button"
              onClick={onContinue}
              disabled={busy}
              className="inline-flex flex-[1.4] items-center justify-center rounded-full bg-zinc-100 px-5 py-3 text-xs font-medium tracking-[0.16em] text-zinc-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              CONTINUE
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          className="inline-flex min-w-[8.5rem] items-center justify-center rounded-full bg-zinc-100 px-8 py-3 text-sm font-medium tracking-[0.12em] text-zinc-950 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          START
        </button>
      )}
    </div>
  );
}
