# Kivo Desktop (Electron)

Menu-bar desktop shell for Kivo: a dashboard window over the web app.

## Architecture

- **Dashboard window** (`/app`) — sessions, live listening, settings, projects
- **Web UI** loads from `KIVO_APP_URL` (default `https://kivo.app`); APIs stay on Vercel

The shell is a convenience wrapper, not a separate product surface. Kivo captures
the room through the **microphone only** — the same path as the browser. System
(loopback) audio capture was removed before launch, and the shell now denies every
`getDisplayMedia` request, so no Screen Recording permission is needed.

## Development

Terminal 1 — Next.js:

```bash
npm run dev
```

Terminal 2 — Electron shell:

```bash
cd desktop
npm install
npm run dev
```

## Auth

1. **Keep Kivo running** in the menu bar before signing in
2. Tray → **Sign In via Browser…** opens `/desktop-auth` in your system browser
3. Sign in with Google or email
4. Browser redirects to `kivo://auth?token=...` (query param — fragments are stripped on macOS)
5. Electron delivers the token to the dashboard via `window.kivoDesktop.onAuthToken`

If you still see the sign-in screen after the browser hand-off, quit and reopen the app from the tray — the pending token is re-applied on load.

**Dev caveat:** macOS may route `kivo://` links to a packaged Kivo install instead of your dev `electron .` session. If deep links fail in dev:
- Quit any installed Kivo.app from `/Applications`
- Run only `cd desktop && npm run dev`
- Or test with a fresh `npm run dist:dir` build

## Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Kivo | `Cmd+Shift+K` (macOS) / `Ctrl+Shift+K` (Windows/Linux) |
| Tray click | Open dashboard |

## Build (macOS)

```bash
cd desktop
npm run dist
```

Output: `desktop/release/Kivo-<version>.dmg`

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `KIVO_APP_URL` | `https://kivo.app` | Base URL for `/app` |

## Files

| Path | Role |
|------|------|
| `src/main.ts` | Main process: tray, dashboard window, deep links, IPC, media permissions |
| `src/preload.ts` | `window.kivoDesktop` bridge |
| `assets/trayTemplate.png` | Menu bar icon |
| `entitlements.mac.plist` | Microphone + hardened runtime |

Web-side bridge: [`src/lib/desktop/bridge.ts`](../src/lib/desktop/bridge.ts)
