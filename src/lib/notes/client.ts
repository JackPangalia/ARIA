"use client";

import { auth } from "@/lib/firebase/client";
import type {
  EnhancedNotesDoc,
  PersonalNotesDoc,
  SessionNotesResponse,
} from "@/lib/notes/types";

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/** A 409 from the notes API: the store has a newer version, or edits exist. */
export class NotesConflictError<T> extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly current: T
  ) {
    super(message);
    this.name = "NotesConflictError";
  }
}

async function notesFetch<T>(
  path: string,
  init?: RequestInit & { keepalive?: boolean }
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...(await authHeaders()), ...(init?.headers ?? {}) },
  });
  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string; code?: string; current?: unknown }
      | null;
    throw new NotesConflictError(
      body?.error ?? "These notes changed elsewhere.",
      body?.code ?? "conflict",
      body?.current as T
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function getSessionNotes(sessionId: string): Promise<SessionNotesResponse> {
  return notesFetch<SessionNotesResponse>(`/api/sessions/${sessionId}/notes`);
}

export async function savePersonalNotes(
  sessionId: string,
  input: { content: string; baseRevision: number },
  options: { keepalive?: boolean } = {}
): Promise<PersonalNotesDoc> {
  return notesFetch<PersonalNotesDoc>(`/api/sessions/${sessionId}/notes`, {
    method: "PUT",
    body: JSON.stringify(input),
    keepalive: options.keepalive,
  });
}

export async function saveEnhancedNotes(
  sessionId: string,
  input: { content: string; baseRevision: number },
  options: { keepalive?: boolean } = {}
): Promise<EnhancedNotesDoc> {
  return notesFetch<EnhancedNotesDoc>(`/api/sessions/${sessionId}/notes/enhanced`, {
    method: "PUT",
    body: JSON.stringify(input),
    keepalive: options.keepalive,
  });
}

export async function generateEnhancedNotes(
  sessionId: string,
  options: { force?: boolean } = {}
): Promise<EnhancedNotesDoc> {
  const data = await notesFetch<{ enhanced: EnhancedNotesDoc }>(
    `/api/sessions/${sessionId}/notes/enhanced`,
    { method: "POST", body: JSON.stringify({ force: Boolean(options.force) }) }
  );
  return data.enhanced;
}
