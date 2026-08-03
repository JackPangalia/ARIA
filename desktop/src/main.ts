import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  session,
  shell,
  Tray,
} from "electron";
import path from "node:path";

/**
 * Kivo desktop shell — a menu-bar app with a single dashboard window loading
 * `/app` from the deployed web app. The web UI ships via Vercel, so UI changes
 * don't require shell releases.
 */
const APP_URL = process.env.KIVO_APP_URL ?? "https://kivo.app";
const APP_ORIGIN = new URL(APP_URL).origin;
const APP_HOTKEY = "CommandOrControl+Shift+K";

let dashboardWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Last custom token from a kivo://auth deep link. Re-delivered to every page
// load so windows created (or refreshed) after the link still sign in; tokens
// expire server-side after an hour, so holding one in memory is bounded risk.
let pendingAuthToken: string | null = null;
let pendingAuthTokenAt = 0;
/** Deep link received before `app.whenReady()` — processed once the shell is up. */
let queuedDeepLink: string | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  bootstrap();
}

function bootstrap(): void {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("kivo", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient("kivo");
  }

  app.on("open-url", (event, url) => {
    event.preventDefault();
    queueOrHandleDeepLink(url);
  });

  app.on("second-instance", (_event, argv) => {
    const link = argv.find((arg) => arg.startsWith("kivo://"));
    if (link) queueOrHandleDeepLink(link);
    if (app.isReady()) showDashboard();
  });

  const launchLink = process.argv.find((arg) => arg.startsWith("kivo://"));
  if (launchLink) queueOrHandleDeepLink(launchLink);

  app.whenReady().then(() => {
    if (queuedDeepLink) {
      handleDeepLink(queuedDeepLink);
      queuedDeepLink = null;
    }

    ipcMain.handle("kivo:get-pending-auth-token", (event) => {
      if (!isTrustedIpcSender(event)) return null;
      if (!pendingAuthToken) return null;
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
    if (!globalShortcut.register(APP_HOTKEY, showDashboard)) {
      console.warn(
        `[Kivo] Could not register ${APP_HOTKEY}; reopen Kivo from the tray menu.`
      );
    }
    app.on("activate", () => showDashboard());
  });

  // Tray app: closing the window must not quit — reopen from the menu bar.
  app.on("window-all-closed", () => {
    // Intentionally empty.
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });
}

function setupWebSessionPolicies(): void {
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const fromApp = isAppUrl(webContents.getURL());
      callback(fromApp && permission === "media");
    }
  );

  // Kivo captures the room through the microphone only. Screen/system-audio
  // capture is denied outright so a compromised frame can't reach it.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    callback({});
  });
}

function isAppUrl(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function isTrustedFrame(frame: Electron.WebFrameMain | null): boolean {
  return Boolean(frame && !frame.isDestroyed() && isAppUrl(frame.url));
}

function isTrustedIpcSender(
  event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent
): boolean {
  return isTrustedFrame(event.senderFrame);
}

function setupIpc(): void {
  ipcMain.on("kivo:open-external", (event, rawUrl) => {
    if (!isTrustedIpcSender(event) || typeof rawUrl !== "string") return;
    if (rawUrl.length > 2_048) return;
    try {
      const url = new URL(rawUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        void shell.openExternal(url.toString());
      }
    } catch {
      // Ignore malformed or unsupported external URLs.
    }
  });

  ipcMain.on("kivo:open-dashboard", (event) => {
    if (isTrustedIpcSender(event)) showDashboard();
  });
}

function windowUserAgent(win: BrowserWindow): string {
  return win.webContents
    .getUserAgent()
    .replace(/ Electron\/\S+/, "")
    .replace(/ kivo-desktop\/\S+/, "");
}

function deliverAuthToken(win: BrowserWindow): void {
  if (!pendingAuthToken) return;
  if (!isAppUrl(win.webContents.getURL())) return;
  if (Date.now() - pendingAuthTokenAt > 55 * 60 * 1000) {
    pendingAuthToken = null;
    return;
  }
  win.webContents.send("kivo:auth-token", pendingAuthToken);
}

function queueOrHandleDeepLink(rawUrl: string): void {
  if (!app.isReady()) {
    queuedDeepLink = rawUrl;
    return;
  }
  handleDeepLink(rawUrl);
}

function handleDeepLink(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return;
  }
  if (url.protocol !== "kivo:" || url.host !== "auth") return;

  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const rawToken = url.searchParams.get("token") ?? fragment.get("token");
  if (!rawToken) return;

  const token = decodeURIComponent(rawToken);
  pendingAuthToken = token;
  pendingAuthTokenAt = Date.now();
  for (const win of BrowserWindow.getAllWindows()) {
    deliverAuthToken(win);
  }
  showDashboard();
}

function attachWindowBehavior(
  win: BrowserWindow,
  options?: { nativeTitle?: string }
): void {
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
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

function createDashboardWindow(): BrowserWindow {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) return dashboardWindow;

  dashboardWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "Kivo",
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 16 },
          // One full-window vibrancy material paired with a single renderer
          // tint so the desktop remains visibly present through the window.
          vibrancy: "under-window" as const,
          transparent: true,
          backgroundColor: "#00000000",
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
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

function showDashboard(): void {
  const win = createDashboardWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray(): void {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, "..", "assets", "trayTemplate.png")
  );
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Kivo");
  tray.setContextMenu(
    Menu.buildFromTemplate([
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
        click: () => void shell.openExternal(`${APP_URL}/desktop-auth`),
      },
      { type: "separator" },
      { label: "Quit Kivo", role: "quit" },
    ])
  );
  tray.on("click", showDashboard);
}
