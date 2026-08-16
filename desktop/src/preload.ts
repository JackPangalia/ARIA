import { contextBridge, ipcRenderer } from "electron";

interface OrbState {
  status: string;
  micLevel: number;
}

// Mirrors `KivoDesktopApi` in the web repo (src/lib/desktop/bridge.ts). Keep
// the two in sync — the web pages feature-detect `window.kivoDesktop`.
contextBridge.exposeInMainWorld("kivoDesktop", {
  platform: process.platform,
  onAuthToken(cb: (token: string) => void) {
    const listener = (_event: Electron.IpcRendererEvent, token: string) =>
      cb(token);
    ipcRenderer.on("kivo:auth-token", listener);
    return () => ipcRenderer.removeListener("kivo:auth-token", listener);
  },
  openExternal(url: string) {
    ipcRenderer.send("kivo:open-external", url);
  },
  openDashboard() {
    ipcRenderer.send("kivo:open-dashboard");
  },
  getPendingAuthToken() {
    return ipcRenderer.invoke("kivo:get-pending-auth-token") as Promise<string | null>;
  },
  // Dashboard renderer -> main -> widget renderer. The widget window has no
  // access to the dashboard's Zustand store (separate JS context), so the
  // live orb state (status + mic level) is relayed over IPC instead.
  publishOrbState(state: OrbState) {
    ipcRenderer.send("kivo:orb-state", state);
  },
  onOrbState(cb: (state: OrbState) => void) {
    const listener = (_event: Electron.IpcRendererEvent, state: OrbState) =>
      cb(state);
    ipcRenderer.on("kivo:orb-state", listener);
    return () => ipcRenderer.removeListener("kivo:orb-state", listener);
  },
  // Widget renderer -> main: pointer-based window dragging. The page sends
  // absolute screen coordinates; main owns the grab offset and window move.
  startWidgetDrag(screenX: number, screenY: number) {
    ipcRenderer.send("kivo:widget-drag-start", screenX, screenY);
  },
  moveWidgetDrag(screenX: number, screenY: number) {
    ipcRenderer.send("kivo:widget-drag-move", screenX, screenY);
  },
  endWidgetDrag() {
    ipcRenderer.send("kivo:widget-drag-end");
  },
});
