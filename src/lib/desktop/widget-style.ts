"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * How the desktop shell's floating widget renders: the full particle orb, or
 * a minimal "kivo" pill. Stored in localStorage — the dashboard window (where
 * settings lives) and the widget window share one Electron session, so they
 * share localStorage, and a `storage` event fired in one reaches the other.
 * That's the live-update channel; no IPC or shell release needed.
 */
export type WidgetStyle = "orb" | "mini";

const STORAGE_KEY = "kivo:widget-style";

const listeners = new Set<() => void>();

export function readWidgetStyle(): WidgetStyle {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "mini"
      ? "mini"
      : "orb";
  } catch {
    return "orb";
  }
}

export function writeWidgetStyle(style: WidgetStyle): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // Storage unavailable (private mode etc.) — the widget just keeps the default.
  }
  // The `storage` event only fires in *other* documents, so the writing
  // window has to be nudged directly.
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

function serverSnapshot(): WidgetStyle {
  return "orb";
}

export function useWidgetStyle(): [WidgetStyle, (style: WidgetStyle) => void] {
  const style = useSyncExternalStore(
    subscribe,
    readWidgetStyle,
    serverSnapshot
  );
  const update = useCallback((next: WidgetStyle) => {
    writeWidgetStyle(next);
  }, []);
  return [style, update];
}
