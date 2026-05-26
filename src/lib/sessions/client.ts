"use client";

import { auth } from "@/lib/firebase/client";
import type {
  CreateSessionSchema,
  PatchSessionSchema,
  SessionDetailResponse,
  SessionDoc,
  TurnDoc,
} from "@/lib/sessions/types";
import type { z } from "zod";

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

export async function createSession(
  input: z.infer<typeof CreateSessionSchema>
): Promise<SessionDoc> {
  return apiFetch<SessionDoc>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listSessions(input?: {
  status?: SessionDoc["status"];
  q?: string;
  limit?: number;
}): Promise<SessionDoc[]> {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.q) params.set("q", input.q);
  if (input?.limit) params.set("limit", String(input.limit));
  const query = params.toString();
  return apiFetch<{ sessions: SessionDoc[] }>(
    `/api/sessions${query ? `?${query}` : ""}`
  ).then((data) => data.sessions);
}

export async function getSessionDetail(
  sessionId: string
): Promise<SessionDetailResponse> {
  return apiFetch<SessionDetailResponse>(`/api/sessions/${sessionId}`);
}

export async function patchSession(
  sessionId: string,
  input: z.infer<typeof PatchSessionSchema>
): Promise<SessionDoc> {
  return apiFetch<SessionDoc>(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function appendSessionTurn(
  sessionId: string,
  input: {
    role: TurnDoc["role"];
    text: string;
    speaker?: number | null;
    sourceUtteranceIds?: string[];
  }
): Promise<TurnDoc> {
  return apiFetch<TurnDoc>(`/api/sessions/${sessionId}/turns`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function summarizeSession(sessionId: string): Promise<{
  summarizedTurnCount: number;
}> {
  return apiFetch<{ summarizedTurnCount: number }>(
    `/api/sessions/${sessionId}/summarize`,
    { method: "POST" }
  );
}

export async function createSessionPin(
  sessionId: string,
  input: { turnId: string; label?: string }
) {
  return apiFetch(`/api/sessions/${sessionId}/pins`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteSessionPin(sessionId: string, pinId: string) {
  return apiFetch(`/api/sessions/${sessionId}/pins?pinId=${encodeURIComponent(pinId)}`, {
    method: "DELETE",
  });
}

export async function exportSession(
  sessionId: string,
  format: "markdown" | "json"
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const token = await user.getIdToken();
  const res = await fetch(
    `/api/sessions/${sessionId}/export?format=${format}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Export failed (${res.status})`);
  }
  return res.text();
}

export async function askSessionQuestion(
  sessionId: string,
  question: string,
  signal?: AbortSignal
): Promise<Response> {
  const headers = await getAuthHeader();
  return fetch("/api/ask", {
    method: "POST",
    headers,
    body: JSON.stringify({ sessionId, question }),
    signal,
  });
}
