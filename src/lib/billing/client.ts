"use client";

import { auth } from "@/lib/firebase/client";
import { track } from "@/lib/analytics/client";
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

export async function startCheckout(
  tier: PaidTier,
  interval: "month" | "year" = "month"
): Promise<string> {
  track("checkout_started", { props: { tier, interval } });
  const { url } = await billingFetch<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ tier, interval, type: "subscription" }),
  });
  return url;
}

export async function buyTopUpPack(packId: "starter_5h" | "pro_12h"): Promise<string> {
  track("topup_checkout_started", { props: { packId } });
  const { url } = await billingFetch<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ type: "topup", packId }),
  });
  return url;
}

export async function openBillingPortal(): Promise<string> {
  const { url } = await billingFetch<{ url: string }>("/api/billing/portal", {
    method: "POST",
  });
  return url;
}
