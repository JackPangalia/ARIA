import type { AriaStatus } from "@/lib/types";

export interface OrbState {
  status: AriaStatus;
  micLevel: number;
  /**
   * Kivo's own answer audio, tapped after echo cancellation has ducked it out
   * of `micLevel`. Without it the widget goes dead exactly while Kivo speaks.
   * Optional so a widget running against an older shell still renders.
   */
  playbackLevel?: number;
}

export interface KivoDesktopApi {
  platform: NodeJS.Platform;
  onAuthToken: (cb: (token: string) => void) => () => void;
  /** Fetch a token delivered before the renderer subscribed (avoids auth race). */
  getPendingAuthToken: () => Promise<string | null>;
  openExternal: (url: string) => void;
  openDashboard: () => void;
  /** Dashboard renderer -> main -> floating widget window (see `/widget`). */
  publishOrbState: (state: OrbState) => void;
  onOrbState: (cb: (state: OrbState) => void) => () => void;
  /** Floating widget: pointer-based window drag (absolute screen coords). */
  startWidgetDrag: (screenX: number, screenY: number) => void;
  moveWidgetDrag: (screenX: number, screenY: number) => void;
  endWidgetDrag: () => void;
}

declare global {
  interface Window {
    kivoDesktop?: KivoDesktopApi;
  }
}

export function isKivoDesktop(): boolean {
  return typeof window !== "undefined" && Boolean(window.kivoDesktop);
}

export function getKivoDesktop(): KivoDesktopApi | null {
  if (!isKivoDesktop()) return null;
  return window.kivoDesktop ?? null;
}

export function desktopAuthUrl(): string {
  if (typeof window === "undefined") return "/desktop-auth";
  return `${window.location.origin}/desktop-auth`;
}

/** Build the desktop hand-off URL. Query param survives macOS protocol routing. */
export function buildDesktopAuthDeepLink(token: string): string {
  return `kivo://auth?token=${encodeURIComponent(token)}`;
}

export function openDesktopAuthDeepLink(link: string): void {
  if (typeof window === "undefined") return;
  const anchor = document.createElement("a");
  anchor.href = link;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    window.location.href = link;
  }, 250);
}
