"use client";

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import type {
  CreateSessionSchema,
  PatchSessionSchema,
  SessionDetailResponse,
  SessionDoc,
  TurnDoc,
  TurnRole,
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
  projectId?: string;
  unassigned?: boolean;
}): Promise<SessionDoc[]> {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.q) params.set("q", input.q);
  if (input?.limit) params.set("limit", String(input.limit));
  if (input?.projectId) params.set("projectId", input.projectId);
  if (input?.unassigned) params.set("unassigned", "true");
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

export async function deleteSession(sessionId: string): Promise<void> {
  await apiFetch<{ deleted: true }>(`/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function appendSessionTurn(
  sessionId: string,
  input: {
    role: TurnDoc["role"];
    text: string;
    speaker?: number | null;
    speakerName?: string | null;
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

/**
 * Regenerate the session title from the whole conversation when it ends.
 * Best-effort: uses `keepalive` so the request still completes if it fires as
 * the engine stops during tab close / unmount. Failures are swallowed.
 */
export async function finalizeSessionTitle(sessionId: string): Promise<void> {
  try {
    const headers = await getAuthHeader();
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/finalize-title`, {
      method: "POST",
      headers,
      keepalive: true,
    });
  } catch {
    // Title finalization is non-critical; never block shutdown on it.
  }
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

export async function sendMeetingBot(
  sessionId: string,
  meetingUrl: string
): Promise<{ botId: string; session: SessionDoc }> {
  return apiFetch<{ botId: string; session: SessionDoc }>("/api/recall/bots", {
    method: "POST",
    body: JSON.stringify({ sessionId, meetingUrl }),
  });
}

export async function stopMeetingBot(
  sessionId: string,
  botId: string
): Promise<void> {
  await apiFetch<{ ok: true }>(
    `/api/recall/bots/${encodeURIComponent(botId)}?sessionId=${encodeURIComponent(
      sessionId
    )}`,
    { method: "DELETE" }
  );
}

export async function prefetchSessionContext(
  sessionId: string,
  question: string
): Promise<void> {
  await apiFetch<{ ok: boolean }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/prefetch-context`,
    {
      method: "POST",
      body: JSON.stringify({ question }),
    }
  );
}

function mapTurnDoc(id: string, data: DocumentData): TurnDoc {
  const toIso = (value: unknown): string => {
    if (value instanceof Date) return value.toISOString();
    if (
      value &&
      typeof value === "object" &&
      "toDate" in value &&
      typeof (value as { toDate: () => Date }).toDate === "function"
    ) {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if (typeof value === "string") return value;
    return new Date().toISOString();
  };

  return {
    id,
    role: data.role as TurnRole,
    text: String(data.text ?? ""),
    speaker: data.speaker == null ? null : Number(data.speaker),
    speakerName: data.speakerName == null ? null : String(data.speakerName),
    sourceUtteranceIds: Array.isArray(data.sourceUtteranceIds)
      ? data.sourceUtteranceIds.map(String)
      : [],
    sequence: Number(data.sequence ?? 0),
    tokenEstimate: Number(data.tokenEstimate ?? 0),
    summarized: Boolean(data.summarized),
    createdAt: toIso(data.createdAt),
  };
}

/** Live Firestore listener for session turns — used in bot mode where the worker
 *  persists server-side and the browser has no local STT stream. */
export function subscribeSessionTurns(
  sessionId: string,
  onTurns: (turns: TurnDoc[]) => void
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};

  const turnsQuery = query(
    collection(db, "users", uid, "sessions", sessionId, "turns"),
    orderBy("sequence", "asc"),
    limit(200)
  );

  return onSnapshot(
    turnsQuery,
    (snapshot) => {
      const turns = snapshot.docs.map((doc) => mapTurnDoc(doc.id, doc.data()));
      onTurns(turns);
    },
    (err) => {
      console.error("[sessions] turn subscription failed:", err);
    }
  );
}

export async function askSessionQuestion(
  sessionId: string,
  question: string,
  speaker?: number | null,
  speakerName?: string | null,
  signal?: AbortSignal,
  sourceUtteranceIds?: string[]
): Promise<Response> {
  const headers = await getAuthHeader();
  return fetch("/api/ask", {
    method: "POST",
    headers,
    body: JSON.stringify({
      sessionId,
      question,
      speaker,
      speakerName,
      sourceUtteranceIds,
    }),
    signal,
  });
}
