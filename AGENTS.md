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
out local speakers). That path is complete: treat its *observable behavior* as
frozen and change it only deliberately. (The model layer underneath it was
rewritten in the Anthropic consolidation — see below — so this is a behavioral
guarantee, not a literal "never edit these files".)

Everything that happens *after* a session stops — the meeting summary and the
transcript — is **shared, live V1 surface**. It is mode-agnostic and applies to
in-person sessions. Don't remove it. The meeting summary
(`context/meetingSummary`) is still generated on stop; it feeds the voice
context for ended sessions and is shown on Overview.

The live session is **orb-first**: a particle orb in the center, listening
status, stop/silence, and a compact caption of what Kivo heard and is saying.
After stop, Overview (Summary / Transcript) is the session. Do not remount the
notes-first conversation page as the live surface.

Notes, enhanced notes, and private Ask Kivo chat are **parked** — built in
`src/components/conversation/`, `src/lib/notes/`, and `src/lib/private-chat/`,
not wired into `SessionWorkspace`. If you touch that code, keep the hard rule:
personal notes, enhanced notes, and private chat **never enter a spoken
answer**. `isolation.test.ts` pins this at the import level; keep it green.
Read [`docs/notes-first-workspace.md`](docs/notes-first-workspace.md) only as
history of the parked attempt.

The older post-session text chat dock (`MeetingChatPanel` / `/api/chat` /
`chat-pipeline`) stays parked — `SESSION_CHAT_ENABLED` is `false` in
`src/lib/features.ts`. Do not remount it.

## The AI stack is 100% Anthropic — don't reintroduce a second vendor

Every model call goes to Anthropic through the AI SDK (`ai` + `@ai-sdk/anthropic`),
called directly. There is no agent framework, no adapter, and no second provider:

- **Live answers** — `runAriaAgentStream` in [`src/lib/aria/agent.ts`](src/lib/aria/agent.ts)
  is a plain `streamText` call. It returns `ReadableStream<string>` of text deltas
  only, fires `onToolEvent` for search *before* any answer text, and surfaces
  errors through the stream. Two callers depend on that contract
  (`answer-pipeline.ts`, `chat-pipeline.ts`) and it is pinned by tests in
  `agent.test.ts` plus the mocked pipeline tests. Don't change it casually.
- **Web search** — Anthropic's server-side `web_search` tool, registered in
  [`src/lib/aria/tools.ts`](src/lib/aria/tools.ts). Query generation, retrieval,
  and filtering all happen inside the same request that writes the answer; no
  tool result round-trips through us. It replaced a nested Gemini call that cost
  a second full inference per answer. Use `webSearch_20250305`, not the newer
  `_20260209` — that one requires programmatic tool calling, which Haiku 4.5
  rejects outright.
- **Background tasks** — summaries, auto-titles, and meeting summaries all run
  on Haiku via [`src/lib/aria/llm/anthropic-client.ts`](src/lib/aria/llm/anthropic-client.ts).
- **`ANTHROPIC_API_KEY` is required at boot.** There is no fallback provider to
  degrade to, and failing fast beats answering with the wrong model mid-turn.

`@openai/agents`, `@openai/agents-extensions`, `@ai-sdk/google`, and `openai` were
all removed. Ask models are Anthropic-only; `parseAnswerModel` coerces the retired
`gemini-2.5-flash` preference to the default for users who still have it stored.

## Virtual meeting notes (desktop system-audio) — REMOVED

A "virtual" session mode captured Zoom/Meet call audio via macOS loopback in the
Electron shell and produced Granola-style notes. It was **deleted before launch**
to keep V1 focused on the in-person experience. Unlike bot mode and connectors,
this is *not* parked behind a flag — the code is gone. Recover it from git
history rather than rewriting it.

What was removed: `src/lib/audio/virtual-meeting-engine.ts`,
`src/lib/audio/system-audio-mixer.ts`, the `"virtual"` value in
`SessionModeSchema`, the `captureMode` fork in `use-aria-recording.ts`, the
"Meeting notes" sidebar entry, and the `setDisplayMediaRequestHandler` /
Screen Recording IPC in `desktop/src/main.ts`.

Two things to know if you bring it back:

- `parseSessionMode` coerces any persisted `"virtual"` session to `"in_person"`,
  so old Firestore docs still read cleanly. There is a test pinning this.
- The desktop shell now **denies** all `getDisplayMedia` requests outright.
  Re-enabling loopback capture means restoring that handler, the preload
  `supportsSystemAudio` flag, and the Screen Recording permission gate.

**Do not re-add system-audio capture or a "meeting notes" (system-audio)
mode without an explicit request.** The parked notes-first page does not
bring back loopback capture.

## Meeting-bot mode (Zoom / Google Meet via Recall.ai) — V2, HARD-DISABLED

The **meeting-bot** mode (a "Kivo" bot that joins a Zoom/Meet call, transcribes,
and speaks answers into the call) has been **verified working end-to-end**
(2026-05-31, live Recall account + real Google Meet) but is **disabled for V1**:

- **`MEETING_BOT_ENABLED` is `false`** in `src/lib/features.ts` — the APIs and bot
 polling are gated on this constant. Do not flip it on for V1 work.
- The worker (`src/worker/bot-server.ts`) is **not deployed** to a persistent host.
- **The bot UI mount point no longer exists.** `SessionWorkspace.tsx` used to render
 an IN PERSON / MEETING toggle and `MeetingBotControls` behind the flag; that dead
 branch was removed during the virtual-mode cleanup, along with the legacy
 `src/components/aria/Controls.tsx`. `MeetingBotControls.tsx` is still in the tree
 but is not mounted anywhere — turning bot mode on for V2 means re-adding an entry
 point, not just flipping the flag.
- In-person mode and bot mode must stay **mutually exclusive per session**; running
 both at once double-captures the same person — that's the v2 "hybrid" case, not
 supported.

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
