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
