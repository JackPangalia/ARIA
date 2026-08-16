/**
 * V1 launch ships in-person mode only.
 *
 * Meeting-bot (Recall / Zoom / Meet) is built but parked for V2. Set to `true`
 * when ready to ship bot mode — also deploy the worker and set RECALL_* env vars
 * (see docs/meeting-bot.md).
 */
export const MEETING_BOT_ENABLED = false;

/**
 * App connectors (Composio — Notion, Gmail, etc.) are built but parked for
 * post-beta. Set to `true` when ready to ship — also set COMPOSIO_API_KEY and
 * read docs/connectors.md.
 */
export const CONNECTORS_ENABLED = false;

/**
 * Post-session text chat dock on Overview ("Continue chat") is built but
 * parked. UI, `/api/chat`, and `chat-pipeline` stay in the tree; flip to
 * `true` and remount `MeetingChatPanel` from `OverviewView` to bring it back.
 */
export const SESSION_CHAT_ENABLED = false;

/**
 * The voice engine (AudioWorklet PCM playback, adaptive barge-in, fast
 * endpointing) is the only path — the pre-V2 loop is dead code kept solely as
 * inline fallbacks that never run.
 */
export const VOICE_ENGINE_V2_ENABLED = true;
