"use client";

import { auth } from "@/lib/firebase/client";

export interface StreamChatInput {
  sessionId: string;
  question: string;
  speaker?: number | null;
  speakerName?: string | null;
  signal?: AbortSignal;
  /** Called with each new slice of answer text as it streams in. */
  onToken: (chunk: string) => void;
}

/**
 * POST /api/chat and stream the answer back token-by-token. Returns the full
 * answer text once the stream closes. Mirrors the auth of `sessions/client`.
 */
export async function streamChat(input: StreamChatInput): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const token = await user.getIdToken();

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId: input.sessionId,
      question: input.question,
      speaker: input.speaker ?? null,
      speakerName: input.speakerName ?? null,
    }),
    signal: input.signal,
  });

  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
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
