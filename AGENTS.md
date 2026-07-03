<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ⚠️ Pending / not-yet-live features — READ BEFORE TOUCHING

Some code in this repo is **built but dormant** — it is intentionally not wired up,
not deployed, and not tested end-to-end. Do **not** assume it works, and do **not**
build on top of it as if it were live. Treat it as a parked feature awaiting a
future revisit.

## V1 ships in-person only

**Kivo V1 is the in-person experience only** (browser mic → Speechmatics → answer
out local speakers). That path is complete and must stay **byte-for-byte unchanged**.

## Meeting-bot mode (Zoom / Google Meet via Recall.ai) — V2, HARD-DISABLED

The **meeting-bot** mode (a "Kivo" bot that joins a Zoom/Meet call, transcribes,
and speaks answers into the call) has been **verified working end-to-end**
(2026-05-31, live Recall account + real Google Meet) but is **disabled for V1**:

- **`MEETING_BOT_ENABLED` is `false`** in `src/lib/features.ts` — the UI, APIs, and
  bot polling are all gated on this constant. Do not flip it on for V1 work.
- The worker (`src/worker/bot-server.ts`) is **not deployed** to a persistent host.
- In-person mode and bot mode are **mutually exclusive per session** (a toggle in
  `SessionWorkspace.tsx` when enabled); running both at once double-captures the same
  person — that's the v2 "hybrid" case, not supported.

**Before extending, deploying, or "fixing" any of this, read
[`docs/meeting-bot.md`](docs/meeting-bot.md)** — it is the source of truth for what
is done, what is unverified, and what is required to turn it on for V2. The affected
paths: `src/worker/`, `src/lib/recall/`, `src/app/api/recall/`, and
`src/components/aria/MeetingBotControls.tsx`.

If a task is about the in-person app (the thing being shipped), you can ignore the
bot code entirely.

## App connectors (Composio — Notion, Gmail, etc.) — POST-BETA, HARD-DISABLED

Third-party **app connectors** (OAuth into Notion, Gmail, Google Calendar, Slack,
etc. via Composio) are **built but disabled for beta**:

- **`CONNECTORS_ENABLED` is `false`** in `src/lib/features.ts` — the UI, APIs, and
  answer-pipeline Composio tools are all gated on this constant. Do not flip it on
  for beta work.
- No connector mentions on the landing page, pricing, settings, or privacy policy.

**Before extending or turning this on, read
[`docs/connectors.md`](docs/connectors.md).** Affected paths: `src/lib/composio/`,
`src/app/api/composio/`, `src/components/firebase/ConnectorsManager.tsx`, and
`src/lib/aria/answer-pipeline.ts`.

If a task is about the beta in-person app, you can ignore connector code entirely.
