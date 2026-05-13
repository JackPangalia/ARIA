"use client";

import { create } from "zustand";
import type {
  AriaStatus,
  IntroductionMode,
  TranscriptUtterance,
  Voiceprint,
} from "./types";

interface AriaState {
  status: AriaStatus;
  introductionMode: IntroductionMode;
  utterances: TranscriptUtterance[];
  expectedParticipants: string[];
  speakerNames: Record<number, string>;
  voiceprints: Voiceprint[];
  errorMessage: string | null;
  micLevel: number;

  setStatus: (s: AriaStatus) => void;
  setIntroductionMode: (mode: IntroductionMode) => void;
  setError: (msg: string | null) => void;
  setMicLevel: (n: number) => void;
  upsertUtterance: (u: TranscriptUtterance) => void;
  patchUtterance: (id: string, patch: Partial<TranscriptUtterance>) => void;
  clearTranscript: () => void;
  setExpectedParticipants: (names: string[]) => void;
  assignSpeakerName: (id: number, name: string) => void;
  renameSpeaker: (id: number, name: string) => void;
  setVoiceprints: (prints: Voiceprint[]) => void;
  upsertVoiceprintLocal: (print: Voiceprint) => void;
  removeVoiceprintLocal: (name: string) => void;
}

export const useAriaStore = create<AriaState>((set) => ({
  status: "idle",
  introductionMode: "off",
  utterances: [],
  expectedParticipants: [],
  speakerNames: {},
  voiceprints: [],
  errorMessage: null,
  micLevel: 0,

  setStatus: (s) => set({ status: s }),
  setIntroductionMode: (mode) => set({ introductionMode: mode }),
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
  setExpectedParticipants: (names) => set({ expectedParticipants: names }),
  assignSpeakerName: (id, name) =>
    set((state) => ({ speakerNames: { ...state.speakerNames, [id]: name } })),
  renameSpeaker: (id, name) =>
    set((state) => ({ speakerNames: { ...state.speakerNames, [id]: name } })),

  setVoiceprints: (prints) => set({ voiceprints: prints }),
  upsertVoiceprintLocal: (print) =>
    set((state) => {
      const idx = state.voiceprints.findIndex((v) => v.name === print.name);
      if (idx === -1) return { voiceprints: [...state.voiceprints, print] };
      const next = state.voiceprints.slice();
      next[idx] = print;
      return { voiceprints: next };
    }),
  removeVoiceprintLocal: (name) =>
    set((state) => ({
      voiceprints: state.voiceprints.filter((v) => v.name !== name),
    })),
}));

export function speakerLabel(
  id: number,
  names: Record<number, string>
): string {
  return names[id] ?? `Speaker ${id + 1}`;
}

export function displayLabelForUtterance(
  u: TranscriptUtterance,
  names: Record<number, string>
): string {
  if (u.assignedName && u.nameConfidence === "high") return u.assignedName;
  return speakerLabel(u.speaker, names);
}

export function transcriptToText(
  utterances: TranscriptUtterance[],
  names: Record<number, string>
): string {
  return utterances
    .filter((u) => u.isFinal && u.text.trim().length > 0)
    .map((u) => `${displayLabelForUtterance(u, names)}: ${u.text}`)
    .join("\n");
}
