"use client";

import { create } from "zustand";
import type { AriaStatus, TranscriptUtterance } from "./types";

interface AriaState {
  status: AriaStatus;
  utterances: TranscriptUtterance[];
  errorMessage: string | null;
  /** Transient status note (e.g. "Reconnecting…") shown without entering error state. */
  notice: string | null;
  micLevel: number;
  effectiveModel: string | null;
  modelFallback: string | null;

  setStatus: (s: AriaStatus) => void;
  setError: (msg: string | null) => void;
  setNotice: (msg: string | null) => void;
  setMicLevel: (n: number) => void;
  setEffectiveModel: (model: string | null, fallback: string | null) => void;
  upsertUtterance: (u: TranscriptUtterance) => void;
  patchUtterance: (id: string, patch: Partial<TranscriptUtterance>) => void;
  /** Drop live utterances by id — used to clear wake/command words and
   * abandoned question-capture fragments that never became a persisted turn. */
  removeUtterances: (ids: string[]) => void;
  /** Renames every live utterance carrying a provider label (speaker correction). */
  relabelUtterances: (
    providerSpeakerLabel: string,
    speakerName: string | null
  ) => void;
  clearTranscript: () => void;
}

export const useAriaStore = create<AriaState>((set) => ({
  status: "idle",
  utterances: [],
  errorMessage: null,
  notice: null,
  micLevel: 0,
  effectiveModel: null,
  modelFallback: null,

  setStatus: (s) => set({ status: s }),
  setError: (msg) =>
    set({ errorMessage: msg, status: msg ? "error" : "idle" }),
  setNotice: (msg) => set({ notice: msg }),

  setMicLevel: (n) => set({ micLevel: n }),
  setEffectiveModel: (effectiveModel, modelFallback) =>
    set({ effectiveModel, modelFallback }),

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

  removeUtterances: (ids) =>
    set((state) => {
      if (ids.length === 0) return state;
      const drop = new Set(ids);
      const next = state.utterances.filter((u) => !drop.has(u.id));
      if (next.length === state.utterances.length) return state;
      return { utterances: next };
    }),

  relabelUtterances: (providerSpeakerLabel, speakerName) =>
    set((state) => ({
      utterances: state.utterances.map((u) =>
        u.providerSpeakerLabel === providerSpeakerLabel
          ? { ...u, speakerName }
          : u
      ),
    })),

  clearTranscript: () => set({ utterances: [] }),
}));

function speakerLabel(utterance: TranscriptUtterance): string {
  return utterance.speakerName ?? `Speaker ${utterance.speaker + 1}`;
}

function speakerKey(u: TranscriptUtterance): string {
  return u.providerSpeakerLabel ?? `speaker:${u.speaker}`;
}

const MERGE_GAP_SECONDS = 3;

/**
 * Append finalized utterances into one plain-text message log, merging
 * contiguous same-speaker fragments into a single turn so the output reads
 * like the persisted transcript rather than the raw interim stream.
 */
export function messagesToText(utterances: TranscriptUtterance[]): string {
  const finals = utterances.filter(
    (u) => u.isFinal && u.text.trim().length > 0
  );
  if (finals.length === 0) return "";

  type Group = {
    label: string;
    speakerKey: string;
    parts: string[];
    end: number;
  };
  const groups: Group[] = [];

  for (const u of finals) {
    const text = u.text.trim();
    const key = speakerKey(u);
    const last = groups[groups.length - 1];
    if (last && last.speakerKey === key && u.start - last.end <= MERGE_GAP_SECONDS) {
      last.parts.push(text);
      last.end = Math.max(last.end, u.end);
    } else {
      groups.push({
        label: speakerLabel(u),
        speakerKey: key,
        parts: [text],
        end: u.end,
      });
    }
  }

  return groups
    .map((g) => `${g.label}: ${g.parts.join(" ").replace(/\s+/g, " ").trim()}`)
    .join("\n");
}
