"use client";

import { auth } from "@/lib/firebase/client";
import type { UsageSummary } from "@/lib/plan/types";
import type { Tier } from "@/lib/plan/tiers";
import type { TranscriptionMode } from "@/lib/sessions/types";
import type { AskModelId, AskModelOption } from "@/lib/aria/models";
import type { KivoVoiceOption } from "@/lib/audio/voices";

async function getAuthHeader(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be signed in.");
  }
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await getAuthHeader();
  const res = await fetch(path, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function getUsage(): Promise<UsageSummary> {
  return apiFetch<UsageSummary>("/api/usage");
}

export interface TranscriptionModePreference {
  tier: Tier;
  defaultTranscriptionMode: TranscriptionMode;
  effectiveTranscriptionMode: TranscriptionMode;
  speakerModeLocked: boolean;
  speakerSecondsUsed: number;
  /** `null` = unlimited Speaker recognition minutes for this tier. */
  speakerSecondsCap: number | null;
  speakerSecondsRemaining: number | null;
  speakerModeExhausted: boolean;
}

export async function getTranscriptionModePreference(): Promise<TranscriptionModePreference> {
  return apiFetch<TranscriptionModePreference>("/api/transcription-mode");
}

export async function updateTranscriptionModePreference(
  defaultTranscriptionMode: TranscriptionMode
): Promise<TranscriptionModePreference> {
  return apiFetch<TranscriptionModePreference>("/api/transcription-mode", {
    method: "PATCH",
    body: JSON.stringify({ defaultTranscriptionMode }),
  });
}

export interface AnswerModelPreference {
  current: AskModelId;
  options: readonly AskModelOption[];
}

export async function getAnswerModelPreference(): Promise<AnswerModelPreference> {
  return apiFetch<AnswerModelPreference>("/api/answer-model");
}

export async function updateAnswerModelPreference(
  answerModel: AskModelId
): Promise<AnswerModelPreference> {
  return apiFetch<AnswerModelPreference>("/api/answer-model", {
    method: "PATCH",
    body: JSON.stringify({ answerModel }),
  });
}

export interface VoiceSettingsPreference {
  current: { voiceId: string };
  voices: readonly KivoVoiceOption[];
}

export async function getVoiceSettings(): Promise<VoiceSettingsPreference> {
  return apiFetch<VoiceSettingsPreference>("/api/voice-settings");
}

export async function updateVoiceSettings(settings: {
  voiceId?: string | null;
}): Promise<VoiceSettingsPreference> {
  return apiFetch<VoiceSettingsPreference>("/api/voice-settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

/** MP3 sample of a voice for the settings preview button. */
export async function fetchVoicePreview(settings: {
  voiceId: string;
}): Promise<ArrayBuffer> {
  const headers = await getAuthHeader();
  const res = await fetch("/api/voice-settings/preview", {
    method: "POST",
    headers,
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    throw new Error("Could not load the voice preview.");
  }
  return res.arrayBuffer();
}

export interface HeartbeatResult {
  remainingSeconds: number;
  stop: boolean;
}

export async function sendHeartbeat(sessionId: string): Promise<HeartbeatResult> {
  return apiFetch<HeartbeatResult>("/api/usage/heartbeat", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}
