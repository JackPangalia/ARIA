"use client";

import { auth } from "@/lib/firebase/client";
import type { UsageSummary } from "@/lib/plan/types";

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
