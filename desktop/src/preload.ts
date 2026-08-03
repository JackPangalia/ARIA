import { contextBridge, ipcRenderer } from "electron";

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
});
