export type OrbCenterMode = "pane" | "viewport";

export const ORB_CENTER_STORAGE_KEY = "aria-orb-center";

export const DEFAULT_ORB_CENTER_MODE: OrbCenterMode = "viewport";

export function isOrbCenterMode(value: string | null | undefined): value is OrbCenterMode {
  return value === "pane" || value === "viewport";
}

export function readStoredOrbCenterMode(): OrbCenterMode {
  if (typeof window === "undefined") return DEFAULT_ORB_CENTER_MODE;

  try {
    const stored = window.localStorage.getItem(ORB_CENTER_STORAGE_KEY);
    return isOrbCenterMode(stored) ? stored : DEFAULT_ORB_CENTER_MODE;
  } catch {
    return DEFAULT_ORB_CENTER_MODE;
  }
}

export function storeOrbCenterMode(mode: OrbCenterMode) {
  try {
    window.localStorage.setItem(ORB_CENTER_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures.
  }
}

export const ORB_CENTER_LABEL: Record<OrbCenterMode, string> = {
  pane: "Pane center",
  viewport: "Screen center",
};

export const ORB_CENTER_DESCRIPTION: Record<OrbCenterMode, string> = {
  pane: "Center the orb in the main area beside the left panels.",
  viewport: "Shift the orb so it sits on the center of your full screen.",
};

export function orbCenterPositionClass(
  mode: OrbCenterMode
): string {
  if (mode === "viewport") {
    return "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2";
  }

  return "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2";
}
