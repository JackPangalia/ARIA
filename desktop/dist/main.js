"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
/**
 * Kivo desktop shell — a menu-bar app with a single dashboard window loading
 * `/app` from the deployed web app. The web UI ships via Vercel, so UI changes
 * don't require shell releases.
 */
const APP_URL = process.env.KIVO_APP_URL ?? "https://kivo.app";
const APP_ORIGIN = new URL(APP_URL).origin;
const APP_HOTKEY = "CommandOrControl+Shift+K";
// Overridable so the size can be tried out without an edit + rebuild cycle:
// `KIVO_WIDGET_SIZE=200 npm run dev`.
const WIDGET_SIZE = Number(process.env.KIVO_WIDGET_SIZE) || 200;
const WIDGET_MARGIN = 24;
let dashboardWindow = null;
let widgetWindow = null;
let tray = null;
// Drives the floating orb widget: it only appears while a session is live
// (`micLive`, from `kivo:orb-state`) and the dashboard isn't what the user is
// looking at (`!dashboardHasFocus`, from the dashboard's own window events).
let dashboardHasFocus = false;
let micLive = false;
let latestOrbState = {
    status: "idle",
    micLevel: 0,
    playbackLevel: 0,
};
// Cursor-to-window offset while the widget is being dragged (see the
// kivo:widget-drag-* IPC handlers).
let widgetDragOffset = null;
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
/** Drag IPC is only honored from the widget window itself — not the dashboard. */
function isWidgetSender(event) {
    return Boolean(widgetWindow &&
        !widgetWindow.isDestroyed() &&
        event.sender === widgetWindow.webContents);
}
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
        createWidgetWindow();
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
    // Widget window dragging. `-webkit-app-region: drag` can't offer
    // click-and-drag on the same surface (it swallows the click), so the widget
    // page tracks pointer events itself and relays absolute screen coordinates
    // here; main keeps the grab offset and moves the window. The existing
    // "moved" listener persists the final position.
    electron_1.ipcMain.on("kivo:widget-drag-start", (event, x, y) => {
        if (!isWidgetSender(event) || !isFiniteNumber(x) || !isFiniteNumber(y)) {
            return;
        }
        const [wx, wy] = widgetWindow.getPosition();
        widgetDragOffset = { x: x - wx, y: y - wy };
    });
    electron_1.ipcMain.on("kivo:widget-drag-move", (event, x, y) => {
        if (!isWidgetSender(event) || !widgetDragOffset)
            return;
        if (!isFiniteNumber(x) || !isFiniteNumber(y))
            return;
        widgetWindow.setPosition(Math.round(x - widgetDragOffset.x), Math.round(y - widgetDragOffset.y));
    });
    electron_1.ipcMain.on("kivo:widget-drag-end", (event) => {
        if (isWidgetSender(event))
            widgetDragOffset = null;
    });
    electron_1.ipcMain.on("kivo:orb-state", (event, rawState) => {
        if (!isTrustedIpcSender(event))
            return;
        if (!rawState || typeof rawState !== "object")
            return;
        const { status, micLevel, playbackLevel } = rawState;
        if (typeof status !== "string" || typeof micLevel !== "number")
            return;
        latestOrbState = {
            status,
            micLevel,
            playbackLevel: typeof playbackLevel === "number" ? playbackLevel : 0,
        };
        micLive = status !== "idle" && status !== "error";
        updateWidgetVisibility();
        widgetWindow?.webContents.send("kivo:orb-state", latestOrbState);
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
    dashboardWindow.on("focus", refreshDashboardFocus);
    dashboardWindow.on("blur", refreshDashboardFocus);
    dashboardWindow.on("show", refreshDashboardFocus);
    dashboardWindow.on("hide", refreshDashboardFocus);
    dashboardWindow.on("minimize", refreshDashboardFocus);
    dashboardWindow.on("restore", refreshDashboardFocus);
    dashboardWindow.on("closed", () => {
        dashboardWindow = null;
        // The renderer (and the mic session it owns) is torn down with the
        // window — there's nothing left to mirror, so drop the widget with it.
        micLive = false;
        refreshDashboardFocus();
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
/** Re-derives whether the dashboard is what the user is currently looking at. */
function refreshDashboardFocus() {
    dashboardHasFocus = Boolean(dashboardWindow &&
        !dashboardWindow.isDestroyed() &&
        dashboardWindow.isVisible() &&
        !dashboardWindow.isMinimized() &&
        dashboardWindow.isFocused());
    updateWidgetVisibility();
}
function widgetPositionFile() {
    return node_path_1.default.join(electron_1.app.getPath("userData"), "widget-position.json");
}
function loadWidgetPosition() {
    try {
        const raw = node_fs_1.default.readFileSync(widgetPositionFile(), "utf8");
        const parsed = JSON.parse(raw);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
            return { x: parsed.x, y: parsed.y };
        }
    }
    catch {
        // No saved position yet (or the file is unreadable) — use the default corner.
    }
    return null;
}
let savePositionTimer = null;
function saveWidgetPositionDebounced(pos) {
    if (savePositionTimer)
        clearTimeout(savePositionTimer);
    savePositionTimer = setTimeout(() => {
        try {
            node_fs_1.default.mkdirSync(node_path_1.default.dirname(widgetPositionFile()), { recursive: true });
            node_fs_1.default.writeFileSync(widgetPositionFile(), JSON.stringify(pos));
        }
        catch {
            // Best-effort — losing the saved position just resets to the default corner.
        }
    }, 400);
}
function defaultWidgetPosition() {
    const { workArea } = electron_1.screen.getPrimaryDisplay();
    return {
        x: workArea.x + workArea.width - WIDGET_SIZE - WIDGET_MARGIN,
        y: workArea.y + workArea.height - WIDGET_SIZE - WIDGET_MARGIN,
    };
}
/** Keeps the widget on-screen even if it was last parked on a display that's since been unplugged. */
function clampToWorkArea(pos) {
    const { workArea } = electron_1.screen.getDisplayNearestPoint(pos);
    return {
        x: Math.min(Math.max(pos.x, workArea.x), workArea.x + workArea.width - WIDGET_SIZE),
        y: Math.min(Math.max(pos.y, workArea.y), workArea.y + workArea.height - WIDGET_SIZE),
    };
}
function updateWidgetVisibility() {
    const win = widgetWindow;
    if (!win || win.isDestroyed())
        return;
    const shouldShow = micLive && !dashboardHasFocus;
    if (shouldShow && !win.isVisible()) {
        win.showInactive();
    }
    else if (!shouldShow && win.isVisible()) {
        win.hide();
    }
}
function createWidgetWindow() {
    if (widgetWindow && !widgetWindow.isDestroyed())
        return widgetWindow;
    const position = clampToWorkArea(loadWidgetPosition() ?? defaultWidgetPosition());
    widgetWindow = new electron_1.BrowserWindow({
        width: WIDGET_SIZE,
        height: WIDGET_SIZE,
        x: position.x,
        y: position.y,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        hasShadow: false,
        resizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        show: false,
        webPreferences: {
            preload: node_path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    // "screen-saver" is the highest level short of fighting the OS — it keeps
    // the orb visible over a fullscreen call, matching how Zoom/Granola-style
    // floating pills stay on top of everything.
    widgetWindow.setAlwaysOnTop(true, "screen-saver");
    // `visibleOnFullScreen` silently flips the app's activation policy to
    // "accessory" on macOS as a side effect, which would stop the dashboard
    // from ever taking foreground focus again. Restore "regular" immediately —
    // the widget keeps its fullscreen collection behavior, the app stays normal.
    widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (process.platform === "darwin")
        electron_1.app.setActivationPolicy("regular");
    attachWindowBehavior(widgetWindow);
    void widgetWindow.loadURL(`${APP_URL}/widget`);
    widgetWindow.webContents.on("did-finish-load", () => {
        widgetWindow?.webContents.send("kivo:orb-state", latestOrbState);
    });
    widgetWindow.on("moved", () => {
        if (!widgetWindow)
            return;
        const [x, y] = widgetWindow.getPosition();
        saveWidgetPositionDebounced({ x, y });
    });
    widgetWindow.on("closed", () => {
        widgetWindow = null;
        widgetDragOffset = null;
    });
    return widgetWindow;
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
