"use client";

import { useEffect } from "react";
import { getKivoDesktop } from "@/lib/desktop/bridge";
import { useAriaStore } from "@/lib/store";

/**
 * Mirrors `status` + `micLevel` from the Zustand store to the desktop shell's
 * floating widget window, which has no access to this renderer's store (it's
 * a separate `BrowserWindow` with its own JS context). No-ops outside the
 * desktop shell.
 *
 * The store also holds fast-changing transcript state (`utterances`) that has
 * nothing to do with the orb, so every store change is filtered down to just
 * the two fields the widget actually renders before publishing — this keeps
 * IPC traffic at roughly the mic-frame rate instead of the transcript rate.
 */
export function useOrbStatePublisher(): void {
  useEffect(() => {
    const desktop = getKivoDesktop();
    if (!desktop) return;

    let lastStatus = useAriaStore.getState().status;
    let lastMicLevel = useAriaStore.getState().micLevel;
    desktop.publishOrbState({ status: lastStatus, micLevel: lastMicLevel });

    return useAriaStore.subscribe((state) => {
      if (state.status === lastStatus && state.micLevel === lastMicLevel) {
        return;
      }
      lastStatus = state.status;
      lastMicLevel = state.micLevel;
      desktop.publishOrbState({ status: lastStatus, micLevel: lastMicLevel });
    });
  }, []);
}
