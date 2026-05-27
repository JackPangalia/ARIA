import { Composio } from "@composio/core";
import { getServerEnv } from "@/lib/env";

let cached: Composio | null = null;

export function isComposioConfigured(): boolean {
  return Boolean(getServerEnv().COMPOSIO_API_KEY);
}

export function getComposio(): Composio {
  if (cached) return cached;
  const apiKey = getServerEnv().COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error("COMPOSIO_API_KEY is not configured.");
  }
  cached = new Composio({ apiKey });
  return cached;
}
