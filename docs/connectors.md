# App connectors (Composio) — POST-BETA ONLY (hard-disabled for beta)

> **Beta does not include connectors.** Connector code exists but is **off** via
> `CONNECTORS_ENABLED = false` in `src/lib/features.ts`. Do not enable it for beta work.
>
> **Read this before touching anything under `src/lib/composio/`,
> `src/app/api/composio/`, or `src/components/firebase/ConnectorsManager.tsx`.**

Last updated: 2026-07-02.

---

## TL;DR

- Connectors let Kivo pull context from and take actions in third-party apps
  (Notion, Gmail, Google Calendar, Slack, etc.) via [Composio](https://composio.dev).
- The integration is **built** (OAuth flow, settings UI, intent routing, agent tools)
  but **dormant** for beta: feature-flagged off, no UI mentions, APIs gated.
- If your task is about the in-person beta app, **ignore all connector code.**

---

## What's built

- Settings UI: `ConnectorsManager.tsx` (web), `ConnectorsSettingsView` (iOS)
- API routes: `/api/composio/connections`, `/api/composio/warm`
- Server lib: `src/lib/composio/*` (client, connections, intent, tools cache)
- Answer pipeline: `resolveConnectorToolkits()` → `loadComposioAgentTools()` → agent tools
- Plan limits: `maxConnectors` in `src/lib/plan/tiers.ts`

---

## Turning connectors on (post-beta)

1. Set `CONNECTORS_ENABLED = true` in `src/lib/features.ts`
2. Set `CONNECTORS_ENABLED = true` in `ARIA/ARIA/Config/Features.swift` (iOS)
3. Configure `COMPOSIO_API_KEY` and auth configs in the Composio dashboard
4. Restore connector copy on landing page, pricing bullets, privacy policy, settings tabs
5. Test OAuth end-to-end for each supported toolkit

---

## File map

| Area | Path |
|------|------|
| Feature flag | `src/lib/features.ts` |
| Composio server lib | `src/lib/composio/` |
| API routes | `src/app/api/composio/` |
| Settings UI (web) | `src/components/firebase/ConnectorsManager.tsx` |
| Settings UI (iOS) | `ARIA/ARIA/Views/Components/SettingsSectionsView.swift` |
| Agent integration | `src/lib/aria/answer-pipeline.ts`, `src/lib/aria/agent.ts` |
| Plan limits | `src/lib/plan/tiers.ts`, `src/lib/plan/entitlements.ts` |
