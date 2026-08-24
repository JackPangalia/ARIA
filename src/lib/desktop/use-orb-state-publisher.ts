"use client";

import { useEffect } from "react";
import { getKivoDesktop, type OrbState } from "@/lib/desktop/bridge";
import { useAriaStore } from "@/lib/store";

/**
 * Mirrors the orb's live state from the Zustand store to the desktop shell's
 * floating widget window, which has no access to this renderer's store (it's
 * a separate `BrowserWindow` with its own JS context). No-ops outside the
 * desktop shell.
 *
 * The store also holds fast-changing transcript state (`utterances`) that has
 * nothing to do with the orb, so every store change is filtered down to just
 * the fields the widget actually renders before publishing — this keeps IPC
 * traffic at roughly the mic-frame rate instead of the transcript rate.
 */
export function useOrbStatePublisher(): void {
  useEffect(() => {
    const desktop = getKivoDesktop();
    if (!desktop) return;

    let last: OrbState = {
      status: useAriaStore.getState().status,
      micLevel: useAriaStore.getState().micLevel,
      playbackLevel: useAriaStore.getState().playbackLevel,
    };
    desktop.publishOrbState(last);

    return useAriaStore.subscribe((state) => {
      if (
        state.status === last.status &&
        state.micLevel === last.micLevel &&
        state.playbackLevel === last.playbackLevel
      ) {
        return;
      }
      last = {
        status: state.status,
        micLevel: state.micLevel,
        playbackLevel: state.playbackLevel,
      };
      desktop.publishOrbState(last);
    });
  }, []);
}
