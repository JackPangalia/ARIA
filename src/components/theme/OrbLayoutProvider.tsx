"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DEFAULT_ORB_CENTER_MODE,
  readStoredOrbCenterMode,
  storeOrbCenterMode,
  type OrbCenterMode,
} from "@/lib/orb-layout";

type OrbLayoutContextValue = {
  mode: OrbCenterMode;
  setMode: (mode: OrbCenterMode) => void;
  toggleMode: () => void;
};

const OrbLayoutContext = createContext<OrbLayoutContextValue | null>(null);

const ORB_LAYOUT_EVENT = "aria-orb-layout-change";

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener(ORB_LAYOUT_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(ORB_LAYOUT_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getOrbLayoutSnapshot(): OrbCenterMode {
  return readStoredOrbCenterMode();
}

function notifyOrbLayoutChange() {
  window.dispatchEvent(new Event(ORB_LAYOUT_EVENT));
}

export function OrbLayoutProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(
    subscribe,
    getOrbLayoutSnapshot,
    () => DEFAULT_ORB_CENTER_MODE
  );

  const setMode = useCallback((next: OrbCenterMode) => {
    storeOrbCenterMode(next);
    notifyOrbLayoutChange();
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "pane" ? "viewport" : "pane");
  }, [mode, setMode]);

  const value = useMemo(
    () => ({ mode, setMode, toggleMode }),
    [mode, setMode, toggleMode]
  );

  return (
    <OrbLayoutContext.Provider value={value}>{children}</OrbLayoutContext.Provider>
  );
}

export function useOrbLayout() {
  const context = useContext(OrbLayoutContext);
  if (!context) {
    throw new Error("useOrbLayout must be used within OrbLayoutProvider.");
  }
  return context;
}
