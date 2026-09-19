# Live session workspace

Proposed direction · September 6, 2026 · **Superseded September 7, 2026**

> Superseded by [`notes-first-workspace.md`](notes-first-workspace.md). The
> whiteboard direction below was not built; the Excalidraw dependency it
> proposed was removed. Kept for the reasoning and the SDK comparison.

## Product decision

Make the live session a useful place to work during an in-person conversation. Starting a session opens a whiteboard. Kivo listens and answers through the existing microphone and speaker flow, with a compact, persistent status control. The user can leave the board empty, type short notes, or sketch relationships.

The previous orb and text-led concepts are superseded. The main surface belongs to the user's work. A large animated assistant, oversized answer text, and promotional empty-state copy do not belong in this view.

Recommended first implementation: one Excalidraw board per session. Its text tool handles short notes. A separate rich-text notebook is a possible alternative if long-form writing proves more important than drawing; it is not a second editor to ship alongside the board in this first change.

## Experience

1. Start a session through the existing start and consent flow. Open the board and collapse the workspace sidebar. Keep navigation reachable.
2. Show a compact session header: title, save state, and End session. Use neutral white/graphite surfaces, compact sans-serif typography, a restrained accent, and subtle canvas texture. Keep these changes scoped to the session workspace initially.
3. Give almost all remaining space to the board. Support selecting, typing, freehand drawing, basic shapes, arrows, erasing, undo, pan, and zoom. Use the SDK's established editing interactions. An empty board needs only a short hint such as “Type or sketch here.”
4. Put a small Kivo status dock at the lower edge, outside the board's input area. Distinguish passive listening, question capture, thinking/searching, speaking, and follow-up. Show a contextual Stop speaking / Cancel answer control. Keep microphone failure and reconnecting states explicit. Keep End session visually separate from interruption.
5. When Kivo speaks, the board and current selection stay in place. No forced view change, focus grab, or automatic zoom. Voice status changes must not remount the editor.
6. End session stops audio promptly and continues the existing summary flow. The board remains available alongside the existing Overview and Transcript. Editing and revisiting the board must not require turning the microphone on.

Desktop and tablet are the primary editing surfaces. Check phone navigation, text entry, pan/zoom, and access to session controls with the actual SDK. Prefer its established touch behavior over a second mobile editor.

## SDK choice

| Option | Fit | Tradeoff |
| --- | --- | --- |
| Excalidraw | Recommended for a shippable whiteboard with text and drawing | MIT-licensed React editor; Kivo still needs to own persistence and integration. Validate how far the supported customization APIs can simplify its chrome. |
| tldraw | Candidate for deeper custom canvas behavior | Commercial production use requires a commercial license. Current pricing requires contacting sales. |
| Tiptap | Best alternative for a conventional notepad | Already installed in this repository, but no active editor integration was found. Good for paragraphs and lists; it is not an infinite whiteboard. |

Excalidraw documentation supports client-only Next.js integration and supplies scene loading and change callbacks. Embedding its editor does not create Kivo's storage, recovery, or collaboration system. Its documented tool-visibility options are limited; do not promise an arbitrary custom toolbar without verifying the public APIs, and do not fork the SDK to reach the first version.

Sources checked September 6, 2026:

- [Excalidraw integration](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration)
- [Excalidraw license](https://github.com/excalidraw/excalidraw/blob/master/LICENSE)
- [Excalidraw scene callbacks and keyboard behavior](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/)
- [Excalidraw UI options](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/ui-options)
- [tldraw licensing](https://tldraw.dev/sdk-features/license-key)
- [Tiptap overview](https://tiptap.dev/docs/editor/getting-started/overview)

## First-release boundary

One private board per session, edited by the session owner. Text, vector shapes, pen strokes, undo, automatic saving, and recovery after refresh are the core requirements. Keep file/image imports, embedded websites, public sharing, multiplayer editing, templates, AI-generated diagrams, and automatic rewriting out of this first implementation.

The board contains user-authored material. Kivo continues grounding spoken answers in the existing conversation context. Reading the board or modifying it by voice would be a separate, deliberate capability, not an implied side effect of mounting an editor. Existing generated summaries and transcripts remain separate records and surfaces.

## Implementation sequence

### 1. Prove the actual SDK in the live workspace

- Introduce a lazy-loaded, client-only board wrapper using the installed Next.js version's local lazy-loading guide.
- Build the compact live-session shell and test actual typing, drawing, undo, focus, and touch behavior before committing to the final visual styling.
- Keep `useAriaRecording` owned by `SessionWorkspace`; it already outlives individual views. Do not move audio lifecycle ownership into the board.
- Isolate editor updates from the microphone/playback envelope. Scope keyboard shortcuts to the editor.
- Use an error boundary around the board so an editor failure leaves recording status and Stop controls accessible.
- Validate supported toolbar/menu customization and package compatibility with the installed React version. The SDK is not currently installed; compatibility has not yet been tested.

### 2. Make the board durable

- Add a dedicated board resource keyed by authenticated user and session, separate from transcript turns and generated summaries.
- Save versioned scene snapshots, with a schema version and server revision. Keep personal viewport/selection state separate from document content.
- Use private object storage for scene payloads and Firestore for the current revision pointer. The client has a Firebase Storage configuration, but usable bucket access and an upload path have not been established by this investigation; verify them before implementation.
- Debounce remote saves and maintain an account/session-scoped IndexedDB draft. Serialize writes and reject stale revisions so delayed saves or a second tab cannot silently overwrite newer work.
- Restore drafts deliberately after a failed save. Display Saved only after server acknowledgement; distinguish local-only recovery from a successful cloud save.
- Flush pending edits on session/view transitions. Retain recoverable drafts when offline. Stopping recording must not wait for a successful upload.
- Apply session ownership, archived/trashed state, and retention rules consistently. Extend session/account deletion to remove board objects: existing Firestore recursive deletion does not remove object-storage payloads.
- Set payload limits and validate scene content. Disable unsupported file paths through paste/import as well as the toolbar.

### 3. Integrate the finished-session experience

- Preserve the board after stopping, refreshing, reopening, and resuming a session.
- Add Board access beside the existing Overview and Transcript surfaces.
- Preserve the existing summary generation, wake-word behavior, follow-up behavior, and voice interruption contract. Keep parked chat, connectors, and meeting-bot features disabled.

### 4. Verify the complete meeting flow

- Start, write and sketch, ask Kivo a question, continue editing during an answer, interrupt, ask a follow-up, stop, reopen, and resume.
- Confirm microphone continuity while switching views and during editor loading/failure. Test audio playback under a representative dense board, not just an empty canvas.
- Verify persistence through refresh, offline edits/reconnect, delayed responses, switching sessions with pending writes, conflicting tabs, and account changes.
- Verify undo, selection, shortcuts, text entry, pointer/touch controls, zoom, and session controls on desktop and phone layouts.
- Test authenticated board access and object cleanup. Run lint/type checks and focused persistence tests; run existing audio regression checks appropriate to any touched behavior.

## Definition of done

A person can start Kivo, spend the meeting typing or drawing without managing the assistant UI, hear and interrupt answers without losing their place, and return later to the same board, overview, and transcript. The first runnable review must use the real editor rather than a drawing of an editor.
