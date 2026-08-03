---
name: verify
description: Drive Kivo's ask pipeline end-to-end against the local dev server (auth token mint, session create, /api/ask, timing logs)
---

# Verifying Kivo server changes end-to-end

The user usually already has `next dev` running on port 3000 (Next's dev lock
refuses a second instance in the same dir — check `.next/dev/logs/next-development.log`
tail before starting your own).

## Auth handle (no browser needed)

Mint a real Firebase ID token for a throwaway uid with the repo's own
firebase-admin + `.env.local` service account:

1. Node script: `createCustomToken("kivo-verify-bot")` via `firebase-admin/auth`
   (createRequire against the repo's package.json), then exchange at
   `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=$NEXT_PUBLIC_FIREBASE_API_KEY`.
   `FIREBASE_PRIVATE_KEY` needs `.replace(/\\n/g, "\n")`.
2. `POST /api/sessions` with `{"title":"..."}` → session id.
3. `POST /api/ask` with `{"sessionId","question"}` → streams `audio/mpeg`;
   validate with `afinfo`, first bytes are `ID3`.
4. Read persisted Q/A back: `GET /api/sessions/:id` → `turns[]`.

## Evidence source

All pipeline timings print to the dev server log
(`.next/dev/logs/next-development.log`): `[ARIA] ask │ … │ llm.first_token`,
`tts.ready`, `audio.first_byte`, plus the model id and the full RAW PROMPT.

## Cleanup (always)

`DELETE /api/sessions/:id`, then `getAuth().deleteUser("kivo-verify-bot")`.

## Gotchas

- Next dev reloads `.env.local` automatically (look for "Reload env" in the log).
- The browser voice loop (mic → wake word → cues) can't be driven headlessly;
  client-side timing changes need a manual talk-to-it test.
