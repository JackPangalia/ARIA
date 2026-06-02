"use client";

import { auth } from "@/lib/firebase/client";
import type { PaidTier } from "@/lib/plan/tiers";

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

async function billingFetch<T>(path: string, init?: RequestInit): Promise<T> {
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

export async function startCheckout(tier: PaidTier): Promise<string> {
  const { url } = await billingFetch<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ tier }),
  });
  return url;
}

export async function openBillingPortal(): Promise<string> {
  const { url } = await billingFetch<{ url: string }>("/api/billing/portal", {
    method: "POST",
  });
  return url;
}
