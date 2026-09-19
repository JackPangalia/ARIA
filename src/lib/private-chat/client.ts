"use client";

import { auth } from "@/lib/firebase/client";
import type { PrivateChatMessage } from "@/lib/private-chat/types";

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function listPrivateChat(
  sessionId: string
): Promise<PrivateChatMessage[]> {
  const res = await fetch(`/api/sessions/${sessionId}/chat`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  const data = (await res.json()) as { messages: PrivateChatMessage[] };
  return data.messages;
}

/**
 * POST a private question and stream the written answer back. Resolves with
 * the full answer once the stream closes.
 */
export async function streamPrivateChat(input: {
  sessionId: string;
  question: string;
  signal?: AbortSignal;
  onToken: (chunk: string) => void;
}): Promise<string> {
  const res = await fetch(`/api/sessions/${input.sessionId}/chat`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ question: input.question }),
    signal: input.signal,
  });

  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Chat failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      full += chunk;
      input.onToken(chunk);
    }
  }
  const tail = decoder.decode();
  if (tail) {
    full += tail;
    input.onToken(tail);
  }
  return full;
}
