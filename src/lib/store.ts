"use client";

import { create } from "zustand";
import type { AriaStatus, TranscriptUtterance } from "./types";

interface AriaState {
  status: AriaStatus;
  utterances: TranscriptUtterance[];
  speakerNames: Record<number, string>;
  errorMessage: string | null;
  micLevel: number;

  setStatus: (s: AriaStatus) => void;
  setError: (msg: string | null) => void;
  setMicLevel: (n: number) => void;
  upsertUtterance: (u: TranscriptUtterance) => void;
  clearTranscript: () => void;
  renameSpeaker: (id: number, name: string) => void;
}

export const useAriaStore = create<AriaState>((set) => ({
  status: "idle",
  utterances: [],
  speakerNames: {},
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

  clearTranscript: () => set({ utterances: [] }),
  renameSpeaker: (id, name) =>
    set((state) => ({ speakerNames: { ...state.speakerNames, [id]: name } })),
}));

export function speakerLabel(
  id: number,
  names: Record<number, string>
): string {
  return names[id] ?? `Speaker ${id + 1}`;
}

export function transcriptToText(
  utterances: TranscriptUtterance[],
  names: Record<number, string>
): string {
  return utterances
    .filter((u) => u.isFinal && u.text.trim().length > 0)
    .map((u) => `${speakerLabel(u.speaker, names)}: ${u.text}`)
    .join("\n");
}
