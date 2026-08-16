"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Mirrors `KivoDesktopApi` in the web repo (src/lib/desktop/bridge.ts). Keep
// the two in sync — the web pages feature-detect `window.kivoDesktop`.
electron_1.contextBridge.exposeInMainWorld("kivoDesktop", {
    platform: process.platform,
    onAuthToken(cb) {
        const listener = (_event, token) => cb(token);
        electron_1.ipcRenderer.on("kivo:auth-token", listener);
        return () => electron_1.ipcRenderer.removeListener("kivo:auth-token", listener);
    },
    openExternal(url) {
        electron_1.ipcRenderer.send("kivo:open-external", url);
    },
    openDashboard() {
        electron_1.ipcRenderer.send("kivo:open-dashboard");
    },
    getPendingAuthToken() {
        return electron_1.ipcRenderer.invoke("kivo:get-pending-auth-token");
    },
    // Dashboard renderer -> main -> widget renderer. The widget window has no
    // access to the dashboard's Zustand store (separate JS context), so the
    // live orb state (status + mic level) is relayed over IPC instead.
    publishOrbState(state) {
        electron_1.ipcRenderer.send("kivo:orb-state", state);
    },
    onOrbState(cb) {
        const listener = (_event, state) => cb(state);
        electron_1.ipcRenderer.on("kivo:orb-state", listener);
        return () => electron_1.ipcRenderer.removeListener("kivo:orb-state", listener);
    },
    // Widget renderer -> main: pointer-based window dragging. The page sends
    // absolute screen coordinates; main owns the grab offset and window move.
    startWidgetDrag(screenX, screenY) {
        electron_1.ipcRenderer.send("kivo:widget-drag-start", screenX, screenY);
    },
    moveWidgetDrag(screenX, screenY) {
        electron_1.ipcRenderer.send("kivo:widget-drag-move", screenX, screenY);
    },
    endWidgetDrag() {
        electron_1.ipcRenderer.send("kivo:widget-drag-end");
    },
});
