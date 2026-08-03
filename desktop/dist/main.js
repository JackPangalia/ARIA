"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
/**
 * Kivo desktop shell — a menu-bar app with a single dashboard window loading
 * `/app` from the deployed web app. The web UI ships via Vercel, so UI changes
 * don't require shell releases.
 */
const APP_URL = process.env.KIVO_APP_URL ?? "https://kivo.app";
const APP_ORIGIN = new URL(APP_URL).origin;
const APP_HOTKEY = "CommandOrControl+Shift+K";
let dashboardWindow = null;
let tray = null;
// Last custom token from a kivo://auth deep link. Re-delivered to every page
// load so windows created (or refreshed) after the link still sign in; tokens
// expire server-side after an hour, so holding one in memory is bounded risk.
let pendingAuthToken = null;
let pendingAuthTokenAt = 0;
/** Deep link received before `app.whenReady()` — processed once the shell is up. */
let queuedDeepLink = null;
const gotLock = electron_1.app.requestSingleInstanceLock();
if (!gotLock) {
    electron_1.app.quit();
}
else {
    bootstrap();
}
function bootstrap() {
    if (process.defaultApp && process.argv.length >= 2) {
        electron_1.app.setAsDefaultProtocolClient("kivo", process.execPath, [
            node_path_1.default.resolve(process.argv[1]),
        ]);
    }
    else {
        electron_1.app.setAsDefaultProtocolClient("kivo");
    }
    electron_1.app.on("open-url", (event, url) => {
        event.preventDefault();
        queueOrHandleDeepLink(url);
    });
    electron_1.app.on("second-instance", (_event, argv) => {
        const link = argv.find((arg) => arg.startsWith("kivo://"));
        if (link)
            queueOrHandleDeepLink(link);
        if (electron_1.app.isReady())
            showDashboard();
    });
    const launchLink = process.argv.find((arg) => arg.startsWith("kivo://"));
    if (launchLink)
        queueOrHandleDeepLink(launchLink);
    electron_1.app.whenReady().then(() => {
        if (queuedDeepLink) {
            handleDeepLink(queuedDeepLink);
            queuedDeepLink = null;
        }
        electron_1.ipcMain.handle("kivo:get-pending-auth-token", (event) => {
            if (!isTrustedIpcSender(event))
                return null;
            if (!pendingAuthToken)
                return null;
            if (Date.now() - pendingAuthTokenAt > 55 * 60 * 1000) {
                pendingAuthToken = null;
                return null;
            }
            return pendingAuthToken;
        });
        setupWebSessionPolicies();
        setupIpc();
        createTray();
        showDashboard();
        if (!electron_1.globalShortcut.register(APP_HOTKEY, showDashboard)) {
            console.warn(`[Kivo] Could not register ${APP_HOTKEY}; reopen Kivo from the tray menu.`);
        }
        electron_1.app.on("activate", () => showDashboard());
    });
    // Tray app: closing the window must not quit — reopen from the menu bar.
    electron_1.app.on("window-all-closed", () => {
        // Intentionally empty.
    });
    electron_1.app.on("will-quit", () => {
        electron_1.globalShortcut.unregisterAll();
    });
}
function setupWebSessionPolicies() {
    electron_1.session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const fromApp = isAppUrl(webContents.getURL());
        callback(fromApp && permission === "media");
    });
    // Kivo captures the room through the microphone only. Screen/system-audio
    // capture is denied outright so a compromised frame can't reach it.
    electron_1.session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
        callback({});
    });
}
function isAppUrl(rawUrl) {
    try {
        return new URL(rawUrl).origin === APP_ORIGIN;
    }
    catch {
        return false;
    }
}
function isTrustedFrame(frame) {
    return Boolean(frame && !frame.isDestroyed() && isAppUrl(frame.url));
}
function isTrustedIpcSender(event) {
    return isTrustedFrame(event.senderFrame);
}
function setupIpc() {
    electron_1.ipcMain.on("kivo:open-external", (event, rawUrl) => {
        if (!isTrustedIpcSender(event) || typeof rawUrl !== "string")
            return;
        if (rawUrl.length > 2_048)
            return;
        try {
            const url = new URL(rawUrl);
            if (url.protocol === "http:" || url.protocol === "https:") {
                void electron_1.shell.openExternal(url.toString());
            }
        }
        catch {
            // Ignore malformed or unsupported external URLs.
        }
    });
    electron_1.ipcMain.on("kivo:open-dashboard", (event) => {
        if (isTrustedIpcSender(event))
            showDashboard();
    });
}
function windowUserAgent(win) {
    return win.webContents
        .getUserAgent()
        .replace(/ Electron\/\S+/, "")
        .replace(/ kivo-desktop\/\S+/, "");
}
function deliverAuthToken(win) {
    if (!pendingAuthToken)
        return;
    if (!isAppUrl(win.webContents.getURL()))
        return;
    if (Date.now() - pendingAuthTokenAt > 55 * 60 * 1000) {
        pendingAuthToken = null;
        return;
    }
    win.webContents.send("kivo:auth-token", pendingAuthToken);
}
function queueOrHandleDeepLink(rawUrl) {
    if (!electron_1.app.isReady()) {
        queuedDeepLink = rawUrl;
        return;
    }
    handleDeepLink(rawUrl);
}
function handleDeepLink(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    }
    catch {
        return;
    }
    if (url.protocol !== "kivo:" || url.host !== "auth")
        return;
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
    const rawToken = url.searchParams.get("token") ?? fragment.get("token");
    if (!rawToken)
        return;
    const token = decodeURIComponent(rawToken);
    pendingAuthToken = token;
    pendingAuthTokenAt = Date.now();
    for (const win of electron_1.BrowserWindow.getAllWindows()) {
        deliverAuthToken(win);
    }
    showDashboard();
}
function attachWindowBehavior(win, options) {
    win.webContents.setUserAgent(windowUserAgent(win));
    win.webContents.on("did-finish-load", () => deliverAuthToken(win));
    if (options?.nativeTitle) {
        win.setTitle(options.nativeTitle);
        win.on("page-title-updated", (event) => {
            event.preventDefault();
        });
    }
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url) && !url.startsWith(APP_ORIGIN)) {
            void electron_1.shell.openExternal(url);
        }
        return { action: "deny" };
    });
}
function createDashboardWindow() {
    if (dashboardWindow && !dashboardWindow.isDestroyed())
        return dashboardWindow;
    dashboardWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 600,
        title: "Kivo",
        ...(process.platform === "darwin"
            ? {
                titleBarStyle: "hiddenInset",
                trafficLightPosition: { x: 16, y: 16 },
                // One full-window vibrancy material paired with a single renderer
                // tint so the desktop remains visibly present through the window.
                vibrancy: "under-window",
                transparent: true,
                backgroundColor: "#00000000",
            }
            : {}),
        webPreferences: {
            preload: node_path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false,
        },
    });
    attachWindowBehavior(dashboardWindow, { nativeTitle: "Kivo" });
    void dashboardWindow.loadURL(`${APP_URL}/app`);
    dashboardWindow.on("closed", () => {
        dashboardWindow = null;
    });
    return dashboardWindow;
}
function showDashboard() {
    const win = createDashboardWindow();
    if (win.isMinimized())
        win.restore();
    win.show();
    win.focus();
}
function createTray() {
    const icon = electron_1.nativeImage.createFromPath(node_path_1.default.join(__dirname, "..", "assets", "trayTemplate.png"));
    icon.setTemplateImage(true);
    tray = new electron_1.Tray(icon);
    tray.setToolTip("Kivo");
    tray.setContextMenu(electron_1.Menu.buildFromTemplate([
        {
            label: "Open Kivo dashboard",
            click: showDashboard,
        },
        {
            label: "Open Kivo",
            accelerator: APP_HOTKEY,
            click: showDashboard,
        },
        { type: "separator" },
        {
            label: "Sign In via Browser…",
            click: () => void electron_1.shell.openExternal(`${APP_URL}/desktop-auth`),
        },
        { type: "separator" },
        { label: "Quit Kivo", role: "quit" },
    ]));
    tray.on("click", showDashboard);
}
