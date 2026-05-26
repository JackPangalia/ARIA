"use client";

import { create } from "zustand";
import type { AriaStatus, TranscriptUtterance } from "./types";

interface AriaState {
  status: AriaStatus;
  utterances: TranscriptUtterance[];
  errorMessage: string | null;
  micLevel: number;

  setStatus: (s: AriaStatus) => void;
  setError: (msg: string | null) => void;
  setMicLevel: (n: number) => void;
  upsertUtterance: (u: TranscriptUtterance) => void;
  patchUtterance: (id: string, patch: Partial<TranscriptUtterance>) => void;
  clearTranscript: () => void;
}

export const useAriaStore = create<AriaState>((set) => ({
  status: "idle",
  utterances: [],
  errorMessage: null,
  micLevel: 0,

  setStatus: (s) => set({ status: s }),
  setError: (msg) =>
    set({ errorMessage: msg, status: msg ? "error" : "idle" }),

  setMicLevel: (n) => set({ micLevel: n }),

  upsertUtterance: (u) =>
    set((state) => {
      const idx = state.utterances.findIndex((x) => x.id === u.id);
      if (idx === -1) return { utterances: [...state.utterances, u] };
      const next = state.utterances.slice();
      next[idx] = u;
      return { utterances: next };
    }),

  patchUtterance: (id, patch) =>
    set((state) => {
      const idx = state.utterances.findIndex((x) => x.id === id);
      if (idx === -1) return state;
      const next = state.utterances.slice();
      next[idx] = { ...next[idx]!, ...patch };
      return { utterances: next };
    }),

  clearTranscript: () => set({ utterances: [] }),
}));

function speakerLabel(id: number): string {
  return `Speaker ${id + 1}`;
}

/** Append finalized transcript lines into one plain-text message log. */
export function messagesToText(utterances: TranscriptUtterance[]): string {
  return utterances
    .filter((u) => u.isFinal && u.text.trim().length > 0)
    .map((u) => `${speakerLabel(u.speaker)}: ${u.text}`)
    .join("\n");
}
