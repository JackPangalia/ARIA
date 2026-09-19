# Notes-first workspace

Parked · September 7, 2026 · **Not the live session**

> Parked September 8, 2026. V1 is orb-first: the particle orb, spoken answers,
> then Overview (summary + transcript). The notes page, enhanced notes, and
> Ask Kivo chat stay in the tree and stay unmounted. Isolation still holds:
> this material never enters a spoken answer.

Kivo's session was briefly a notes page that listens. This document records
what was built so it can be revived later without becoming the product again.

## Experience

- **Home** (`SessionHub`): greeting, **New conversation**, search, recent
  conversations. No hero image. Projects and settings stay in the sidebar.
- **Conversation page** (`src/components/conversation/`): one page for the
  whole lifecycle.
  - Header: **My notes / Enhanced** switcher, autosave status, and the
    Transcript, Ask Kivo, Copy, and Export actions.
  - Center: the Tiptap editor (`NotesEditor`), loaded client-only. Headings,
    emphasis, and lists only.
  - Side panel (one at a time): the speaker-labelled transcript with the
    existing attribution correction, or the private Ask Kivo chat. Under
    1024px the panel is a full-height sheet.
  - Spoken-answer caption above the controls: the question Kivo heard, the
    streaming answer, **Stop answer**. Dismissible.
  - Bottom bar: **Start listening** before capture; mic meter, elapsed time,
    status orb, "Say Hey Kivo", **Stop answer**, and **End conversation**
    during capture.
- **After capture**: the page stays put. The existing meeting summary is
  generated as before, then enhanced notes are written and the Enhanced view
  opens. Existing sessions show their old recap under Enhanced until enhanced
  notes are generated.

## Data

Two new subcollections under each session, both server-written (Admin SDK)
and owner-readable in `firestore.rules`:

- `notes/personal` — `{ content, revision, updatedAt }`.
- `notes/enhanced` — `{ content, revision, status, error, generatedAt,
  editedAt, sourceNotesRevision, sourceTurnCount, updatedAt }`.
- `chat/{messageId}` — `{ role, text, sequence, createdAt, interrupted? }`.

Content is sanitized HTML (`src/lib/notes/sanitize-html.ts`): only
`h1–h3 p ul ol li strong em br blockquote`, no attributes. The same sanitizer
runs on editor saves and on model output.

Saves are compare-and-set on `revision` (`PUT /api/sessions/:id/notes`,
`PUT …/notes/enhanced`). A stale base revision returns 409 with the current
document; the client shows **Reload / Keep mine**. Drafts are also mirrored to
`localStorage` keyed by session and revision, and restored on load only when
the server revision still matches. `pagehide` flushes with `keepalive`.

Enhanced notes (`POST …/notes/enhanced`, `src/lib/notes/enhance.ts`) read the
transcript (cleaned overlay), the meeting summary when present, and the
personal notes, and ask Haiku for constrained HTML. Rules in
`src/lib/notes/revision.ts`:

- a generation in flight refuses a second (`409 generating`), recovering after
  three minutes;
- a hand-edited document refuses regeneration unless `force` (`409 edited`),
  which the UI confirms first;
- an edit that lands while the model is writing wins over the result.

## Isolation

Personal notes, enhanced notes, and private chat never reach a spoken answer.
This is enforced structurally and pinned by
`src/lib/private-chat/isolation.test.ts`:

- nothing in `src/lib/aria/`, the ask route, the prefetch cache, or the
  sessions repository imports from `src/lib/notes/` or `src/lib/private-chat/`;
- the private side never calls `appendTurn`, `maybeCompactSession`,
  `autoTitleSession`, `storePrefetchedContext`, or the summary upserts.

The private chat pipeline (`src/lib/private-chat/pipeline.ts`) reuses
`buildContextBundle` read-only for room context, adds the notes, uses its own
thread as history, and calls `runAriaAgentStream` with `delivery: "text"`.
It records ask usage for billing and nothing else.

The old shared-history chat (`MeetingChatPanel`, `/api/chat`,
`chat-pipeline.ts`) stays parked and unmounted.

## Not done

- No collaborative editing, no new capture modes, no mobile-native editor.
- Live-room verification of the new bottom bar and answer caption (mic, wake
  word, barge-in) still needs a real session; the audio engine itself was not
  changed beyond publishing the answer caption to the store.
- Enhanced notes run on Haiku (`ENHANCED_NOTES_MODEL_ID`); move to Sonnet if
  quality warrants.
