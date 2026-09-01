"use client";

import { useCallback, useSyncExternalStore } from "react";

export const ORB_BODIES = ["cream", "dark"] as const;

export type OrbBody = (typeof ORB_BODIES)[number];

export const DEFAULT_ORB_BODY: OrbBody = "cream";

export const ORB_BODY_LABELS: Record<OrbBody, string> = {
  cream: "Cream",
  dark: "Dark",
};

const STORAGE_KEY = "kivo:orb-body";
const BODY_SET = new Set<string>(ORB_BODIES);

const listeners = new Set<() => void>();

export function parseOrbBody(value: unknown): OrbBody {
  if (typeof value === "string" && BODY_SET.has(value)) {
    return value as OrbBody;
  }
  return DEFAULT_ORB_BODY;
}

export function orbBodyIndex(body: OrbBody): number {
  return ORB_BODIES.indexOf(body);
}

export function readOrbBody(): OrbBody {
  try {
    return parseOrbBody(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_ORB_BODY;
  }
}

export function writeOrbBody(body: OrbBody): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, parseOrbBody(body));
  } catch {
    // Private mode / quota — keep the in-memory default.
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function serverSnapshot(): OrbBody {
  return DEFAULT_ORB_BODY;
}

export function useOrbBody(): [OrbBody, (body: OrbBody) => void] {
  const body = useSyncExternalStore(subscribe, readOrbBody, serverSnapshot);
  const update = useCallback((next: OrbBody) => {
    writeOrbBody(parseOrbBody(next));
  }, []);
  return [body, update];
}
