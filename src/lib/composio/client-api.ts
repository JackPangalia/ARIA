"use client";

import { auth } from "@/lib/firebase/client";

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const token = await user.getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export interface ConnectionSummary {
  id: string;
  toolkit: string;
  status: string;
  isDisabled: boolean;
  createdAt: string;
}

export async function listConnections(): Promise<ConnectionSummary[]> {
  const data = await authedFetch<{ connections: ConnectionSummary[] }>(
    "/api/composio/connections"
  );
  return data.connections;
}

export async function startConnection(
  toolkit: string,
  callbackUrl?: string
): Promise<{ id: string; redirectUrl: string | null }> {
  return authedFetch("/api/composio/connections", {
    method: "POST",
    body: JSON.stringify({ toolkit, callbackUrl }),
  });
}

export async function removeConnection(id: string): Promise<void> {
  await authedFetch(
    `/api/composio/connections?id=${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}

/** Prefetch Composio tool catalog for the signed-in user (fire-and-forget safe). */
export async function warmComposioTools(): Promise<void> {
  await authedFetch<{ ok: boolean }>("/api/composio/warm", { method: "POST" });
}
