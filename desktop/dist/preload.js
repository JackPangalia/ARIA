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
});
