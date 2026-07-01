"use client";

import { auth } from "@/lib/firebase/client";
import type {
  ProjectDoc,
  ProjectSourceDoc,
} from "@/lib/projects/types";

async function getAuthHeader(options?: { json?: boolean }): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be signed in.");
  }
  const token = await user.getIdToken();
  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
  };
  if (options?.json !== false) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
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

async function formApiFetch<T>(path: string, body: FormData): Promise<T> {
  const headers = await getAuthHeader({ json: false });
  const res = await fetch(path, {
    method: "POST",
    body,
    headers,
  });

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorBody?.error ?? `Request failed (${res.status})`);
  }

  return (await res.json()) as T;
}

export async function listProjects(input?: {
  includeArchived?: boolean;
}): Promise<ProjectDoc[]> {
  const params = new URLSearchParams();
  if (input?.includeArchived) params.set("includeArchived", "true");
  const query = params.toString();
  const data = await apiFetch<{ projects: ProjectDoc[] }>(
    `/api/projects${query ? `?${query}` : ""}`
  );
  return data.projects;
}

export async function createProject(input: {
  name: string;
  instructions?: string;
  color?: string;
  icon?: string;
}): Promise<ProjectDoc> {
  return apiFetch<ProjectDoc>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function patchProject(
  projectId: string,
  input: {
    name?: string;
    instructions?: string;
    status?: ProjectDoc["status"];
    color?: string;
    icon?: string;
  }
): Promise<ProjectDoc> {
  return apiFetch<ProjectDoc>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function archiveProject(projectId: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  });
}

export async function listProjectSources(
  projectId: string
): Promise<ProjectSourceDoc[]> {
  const data = await apiFetch<{ sources: ProjectSourceDoc[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/sources`
  );
  return data.sources;
}

export async function uploadProjectSource(
  projectId: string,
  input: { file?: File; text?: string; name?: string }
): Promise<ProjectSourceDoc> {
  const body = new FormData();
  if (input.file) {
    body.set("file", input.file);
  }
  if (input.text) {
    body.set("text", input.text);
  }
  if (input.name) {
    body.set("name", input.name);
  }
  return formApiFetch<ProjectSourceDoc>(
    `/api/projects/${encodeURIComponent(projectId)}/sources`,
    body
  );
}

export async function deleteProjectSource(
  projectId: string,
  sourceId: string
): Promise<void> {
  await apiFetch<{ ok: true }>(
    `/api/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`,
    { method: "DELETE" }
  );
}
