"use client";

import { create } from "zustand";
import type { AriaStatus, TranscriptUtterance } from "./types";

export type SpeakerNames = Record<number, string>;

interface AriaState {
  status: AriaStatus;
  utterances: TranscriptUtterance[];
  speakerNames: SpeakerNames;
  errorMessage: string | null;
  micLevel: number;

  setStatus: (s: AriaStatus) => void;
  setError: (msg: string | null) => void;
  setMicLevel: (n: number) => void;
  assignSpeakerName: (speakerId: number, name: string) => void;
  clearSpeakerNames: () => void;
  upsertUtterance: (u: TranscriptUtterance) => void;
  patchUtterance: (id: string, patch: Partial<TranscriptUtterance>) => void;
  clearTranscript: () => void;
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

  assignSpeakerName: (speakerId, name) =>
    set((state) => {
      const cleanName = normalizeSpeakerName(name);
      if (!cleanName) return state;
      return {
        speakerNames: {
          ...state.speakerNames,
          [speakerId]: cleanName,
        },
      };
    }),

  clearSpeakerNames: () => set({ speakerNames: {} }),

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

export function speakerLabel(id: number): string {
  return `Speaker ${id + 1}`;
}

function normalizeSpeakerName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function displayLabelForUtterance(
  u: TranscriptUtterance,
  speakerNames: SpeakerNames = useAriaStore.getState().speakerNames
): string {
  const name = speakerNames[u.speaker];
  if (name) return name;
  return speakerLabel(u.speaker);
}

export function transcriptToText(
  utterances: TranscriptUtterance[],
  speakerNames: SpeakerNames = useAriaStore.getState().speakerNames
): string {
  return utterances
    .filter((u) => u.isFinal && u.text.trim().length > 0)
    .map((u) => `${displayLabelForUtterance(u, speakerNames)}: ${u.text}`)
    .join("\n");
}
