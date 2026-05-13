"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/firebase/AuthProvider";
import { useAriaStore } from "@/lib/store";
import { AriaEngine } from "@/lib/audio/aria-engine";

export function Controls() {
  const status = useAriaStore((s) => s.status);
  const { user } = useAuth();
  const engineRef = useRef<AriaEngine | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      void engineRef.current?.stop();
    };
  }, []);

  const isRunning = status !== "idle" && status !== "error";

  const onStart = async () => {
    if (isRunning || busy) return;
    setBusy(true);
    try {
      engineRef.current = new AriaEngine();
      await engineRef.current.start({ uid: user?.uid ?? null });
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
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={onStart}
        disabled={busy || isRunning}
        className="inline-flex min-w-[7rem] items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-opacity hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        Start
      </button>
      <button
        type="button"
        onClick={onStop}
        disabled={busy || !isRunning}
        className="inline-flex min-w-[7rem] items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-medium text-zinc-800 transition-opacity hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        Stop
      </button>
    </div>
  );
}
