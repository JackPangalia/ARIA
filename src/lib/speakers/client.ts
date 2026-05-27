"use client";

import { auth } from "@/lib/firebase/client";
import type { SpeakerProfileDoc } from "@/lib/speakers/types";

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
    headers: {
      ...headers,
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }

  return (await res.json()) as T;
}

export async function getSpeechmaticsToken(): Promise<{
  token: string;
  expiresIn: number;
  region: string;
}> {
  return apiFetch("/api/speechmatics/token", { method: "POST" });
}

export async function listSpeakerProfiles(): Promise<SpeakerProfileDoc[]> {
  const data = await apiFetch<{ profiles: SpeakerProfileDoc[] }>(
    "/api/speaker-profiles"
  );
  return data.profiles;
}

export async function saveSpeakerProfile(input: {
  name: string;
  speakerIdentifiers: string[];
  sampleCount?: number;
}): Promise<SpeakerProfileDoc> {
  return apiFetch<SpeakerProfileDoc>("/api/speaker-profiles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function patchSpeakerProfile(
  profileId: string,
  input: {
    name?: string;
    speakerIdentifiers?: string[];
    sampleCount?: number;
  }
): Promise<SpeakerProfileDoc> {
  return apiFetch<SpeakerProfileDoc>(
    `/api/speaker-profiles/${encodeURIComponent(profileId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    }
  );
}

export async function deleteSpeakerProfile(profileId: string): Promise<void> {
  await apiFetch<{ ok: true }>(
    `/api/speaker-profiles/${encodeURIComponent(profileId)}`,
    { method: "DELETE" }
  );
}
