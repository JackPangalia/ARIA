export interface KivoDesktopApi {
  platform: NodeJS.Platform;
  onAuthToken: (cb: (token: string) => void) => () => void;
  /** Fetch a token delivered before the renderer subscribed (avoids auth race). */
  getPendingAuthToken: () => Promise<string | null>;
  openExternal: (url: string) => void;
  openDashboard: () => void;
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
