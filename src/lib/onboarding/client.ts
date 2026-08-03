"use client";

import { auth } from "@/lib/firebase/client";

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

export async function getOnboardingStatus(): Promise<{ needed: boolean }> {
  return apiFetch<{ needed: boolean }>("/api/onboarding");
}

export async function completeOnboarding(): Promise<{ completed: boolean }> {
  return apiFetch<{ completed: boolean }>("/api/onboarding", { method: "POST" });
}

/** Dev-only: `/app?onboarding=1` replays the wizard without touching account state. */
export function isOnboardingPreview(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("onboarding") === "1";
}
