# Chat mode (archived)

Archived **2026-07-04** — deferred for V1 launch. V1 ships in-person voice only.

## What this was

A **Chat** tab alongside **Voice** in `SessionWorkspace`: typed questions against the
same session transcript, with answers streamed as text (TTS optional via settings).
Reused `runAnswerPipeline` with `outputMode: "text"` and a relaxed agent prompt
(`deliveryMode: "text"`).

## Files in this archive

| Path | Role |
| --- | --- |
| `ChatPanel.tsx` | Typed input + streaming answer UI |
| `SessionModeTabs.tsx` | Voice / Chat tab switcher |
| `chat-settings-route.ts` | GET/PATCH user pref `speakChatAnswers` |

Backend hooks that were removed from the live app (restore from git history or
re-add when reviving):

- `AskBodySchema.outputMode` in `src/lib/sessions/types.ts`
- `askSessionQuestion(..., outputMode)` in `src/lib/sessions/client.ts`
- Text stream branch + `outputMode` in `src/lib/aria/answer-pipeline.ts`
- `deliveryMode` + `TEXT_DELIVERY_ADDENDUM` in `src/lib/aria/agent.ts`
- Text response headers in `src/app/api/ask/route.ts`
- `speakChatAnswers` on user plan + `ChatAnswerSettings` in settings UI

## To restore

1. Copy the three files back to their original paths under `src/`.
2. Re-wire `SessionWorkspace` (tabs, `ChatPanel`, `activeTab` state).
3. Re-add the backend hooks listed above (see git diff before this archive).
4. Re-add settings: `ChatAnswerSettings` in `SettingsModal`, plan client/repository types.
