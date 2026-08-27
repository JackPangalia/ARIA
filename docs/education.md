# Contextual education

Education is optional and independent of the retired onboarding flow. The public guide lives at
`/guide`, with links from the marketing navigation and footer and the workspace
footer (including mobile navigation). It requires no account. The workspace link
opens a separate browser tab, or the external browser in Electron, without changing
recording state. There is no in-app guide modal.

## Developer / visual preview

Open **Settings → Account → Helpful tips → Preview tips** to see callouts immediately on the current
screen. This is local to the current visit: it does not enroll the account, reset
saved progress, or require a successful education API request. It ignores the
twenty-second cooldown and three-tip limit, but still requires a visible real
target and suppresses tips during answers, recording setup, and open dialogs.
Open a conversation to see the listening tip, ask a question for follow-up, or
open a completed transcript for speaker attribution. **Exit preview** returns to
normal scheduling. **Show tips again** in the same settings group remains the separate persisted reset.
Preview is available in workspace settings; the standalone settings page offers
the persisted reset.

## Release

Automatic enrollment is on by default for new accounts. The fixed release cutoff
is `EDUCATION_LAUNCH_AT` in `src/lib/education/model.ts` (2026-08-27T03:33:07Z).
No environment variable or manual setup is required. Firebase account creation
time at or after that instant enables tips; older accounts can opt in from settings.
Keep the cutoff fixed across deploys. Saved dismissals and Hide tips are respected.
If eligibility cannot be loaded, automatic tips stay suppressed; the public guide
and local preview remain available.

No database migration or Firestore rule change is needed. The authenticated
`GET/PATCH /api/education` endpoints store version 1 progress in
`users/{uid}/private/education`, already owner-readable and server-write-only.
GET derives defaults without writing a document; PATCH commits transactionally.
Retirement merges across devices. A replay increments the generation so delayed
retire/hide requests from an earlier run cannot overwrite a replay.

Dismissals update locally immediately. Failed writes stay in an in-memory outbox
and retry on reconnect or window focus; do not block the conversation. Successfully
saved progress is shared across devices via Firestore. An offline dismissal that
has not been saved will be lost if the page is closed. Settings reports reset errors.

## Behavior

One card at a time, no more than three per workspace visit, and at least twenty
seconds after a card disappears before another is shown. A visit lasts for the
authenticated workspace mount; switching sessions does not reset it. Replay resets
the visit budget. Topics interrupted before dismissal can be offered on a later
visit, but never repeat within the same visit.

Targets register element references. Only visible, unclipped controls qualify;
cards hide if their target leaves the viewport. No guidance during capture,
thinking, search, playback, reconnecting, errors, editing, or open menus/dialogs.
Speaker guidance takes precedence over Overview when both are available.

This layer does not alter the audio engine, recording consent, speaker attribution,
or the underlying workspace layout. Marketing changes are limited to guide links
and the new guide article. Bot mode, session chat, and connectors remain disabled.
