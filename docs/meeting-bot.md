# Meeting-bot mode (Zoom / Google Meet) — V2 ONLY (hard-disabled for V1)

> **V1 ships in-person only.** Meeting-bot code exists but is **off** via
> `MEETING_BOT_ENABLED = false` in `src/lib/features.ts`. Do not enable it for
> V1 work.
>
> **Read this before touching anything under `src/worker/`, `src/lib/recall/`,
> `src/app/api/recall/`, or `src/components/aria/MeetingBotControls.tsx`.**
>
> As of 2026-05-31 this has been **run end-to-end against a live Recall account and
> a real Google Meet call**: the bot joined, transcribed remote audio with roster
> names, and **spoke Kivo's answer into the call**. It is **hard-disabled for V1**
> (`MEETING_BOT_ENABLED` in `src/lib/features.ts`) and the worker is **not deployed**
> to a persistent host yet. The **in-person** Kivo experience is the V1 product and
> must stay byte-for-byte unchanged.
>
> **In-person mode and bot mode are mutually exclusive per session** (an explicit
> "IN PERSON / MEETING" toggle in `SessionWorkspace.tsx`). Running both at once
> double-captures the same person — that is the v2 "hybrid" case, not supported yet.

Last updated: 2026-05-31.

---

## TL;DR for an AI agent or new developer

- The **in-person** path (browser mic → Speechmatics → answer out local speakers) is
  the **real, shipping product**. It is complete and must stay **byte-for-byte
  unchanged**.
- **Meeting-bot mode** is an *additive* second mode: a "Kivo" bot joins a Zoom/Meet
  call, transcribes with speaker names from the meeting roster (no diarization /
  voiceprint needed), and **speaks Kivo's answer back into the call so everyone
  hears it**.
- It is **dormant**: feature-flagged off, env unset, worker not deployed, Recall
  payloads unverified. See "What's NOT done" below.
- If your task is about the in-person app, **ignore all the bot code.**

---

## The vision (why this exists)

Three participants in a meeting: you, your friend, and **Kivo**. Kivo listens to the
whole call, and when someone says the wake word and asks a question, Kivo answers
**out loud into the call** — a shared participant everyone hears, not a private
earpiece. In-person this happens through a phone's mic/speaker in the room; bot mode
extends the exact same experience to remote Zoom/Meet calls.

---

## Architecture

Everything downstream of "we have a question + a speaker" is **transport-agnostic
server code shared by both modes**. Only the audio *source* and *sink* differ.

```
                shared "brain" (src/lib):
   buildContextBundle → runAriaAgentStream → runAnswerPipeline → Cartesia TTS
                         + appendTurn / maybeCompactSession
                    ▲                                   ▲
  In-person (LIVE)  │ calls                       calls │  Bot mode (PENDING)
  mic → Speechmatics→ AriaEngine → /api/ask             │  Recall bot in Zoom/Meet
                                                         │   ├─ realtime WS: per-speaker
                                                         │   │   transcripts + names
                                                         │   ▼
                                                  Bot Worker (Railway, persistent Node)
                                                         ├─ events → TranscriptUtterance
                                                         ├─ QuestionCaptureMachine (shared)
                                                         ├─ runAnswerPipeline() → MP3
                                                         └─ POST MP3 → Recall Output Audio
                                                            → bot speaks into the call
```

The shared "brain" was extracted so logic is never forked between the two modes —
`runAnswerPipeline()` (`src/lib/aria/answer-pipeline.ts`) is called by both the
`/api/ask` route (browser) and the bot worker.

---

## File map

| Path | Role | Status |
| --- | --- | --- |
| `src/lib/aria/answer-pipeline.ts` | Shared context→LLM→TTS→MP3→persist engine. **Used by the live in-person path too.** | Live (shared) |
| `src/lib/aria/conversation/wake.ts` | Pure wake-word / question helpers (single-sourced). | Live (shared) |
| `src/lib/aria/conversation/question-capture-machine.ts` | Transport-agnostic capture state machine used by the worker. | Built, bot-only |
| `src/worker/bot-server.ts` | Long-lived Node WS server Recall connects to. Run with `npm run worker` (tsx). | Built, **not deployed** |
| `src/lib/recall/client.ts` | Recall REST wrapper: createBot / outputAudio / leaveBot. | Built, **payloads unverified** |
| `src/lib/recall/transcript-adapter.ts` | Parses Recall realtime events → `NormalizedTranscript`. | Built, **payloads unverified** |
| `src/app/api/recall/bots/route.ts` | `POST` — send the bot. Returns **503** when Recall unconfigured. | Built, inert |
| `src/app/api/recall/bots/[botId]/route.ts` | `DELETE` — remove the bot. | Built, inert |
| `src/app/api/recall/webhook/route.ts` | Recall status callbacks. Shared-secret check only (not Svix). | Built, inert |
| `src/components/aria/MeetingBotControls.tsx` | "Join a Zoom/Meet call" UI. | Built, **hidden by flag** |
| `Dockerfile.worker` | Container for the worker (Railway). | Built, unused |

Session data model (`src/lib/sessions/types.ts`): `mode`, `botId`,
`meetingPlatform`, `botStatus` on `SessionDoc`; `setSessionBotState()` in the
repository. All optional with safe defaults so in-person sessions are unaffected.

---

## Why it's safe to ship the app with this code present

- **`MEETING_BOT_ENABLED` is `false`** in `src/lib/features.ts` — UI, APIs, and bot
  polling are all gated on this constant. No env var to forget at deploy time.
- **Worker is a separate process** that is simply never started — it is not part of
  the Vercel build.
- **In-person path is untouched** — bot mode only *added* code; it changed none of
  the mic/Speechmatics/`/api/ask` behavior (the `/api/ask` refactor is a pure
  extraction verified to be behavior-identical).

So with the default, the deployed app behaves exactly like the pre-bot app.

---

## What's NOT done (the real TODO list — do not assume otherwise)

1. ~~No live Recall test~~ **Done (2026-05-31):** verified against a live account +
   real Google Meet. `createBot` now sets `automatic_audio_output` (required before
   Output Audio works; seeded with `src/lib/recall/silent-mp3.ts`), Recall endpoints
   use trailing slashes, and the adapter reads word-level `{relative}` timestamps.
   Remaining tuning is quality, not correctness — speaker **names** depend on the
   `meeting_captions` provider (Google Meet may need captions enabled); use
   `RECALL_DEBUG=1` if names come through blank.
2. **Worker is not deployed.** No Railway (or other) service exists.
3. **Webhook security is minimal.** `src/app/api/recall/webhook/route.ts` uses a
   shared-secret check; production should use **Svix signature verification**.
4. **No hybrid mode.** Mic + bot in one session (local room + remote participants)
   needs echo/dedup handling and is not built.
5. **Latency is v1-naive.** The bot buffers the *full* answer MP3, then plays it.
   A v2 would stream audio into the call for lower latency.
6. **No calendar auto-join.** Bot is started by pasting a link only.

---

## Turning it on (future revisit — checklist)

When ready to actually run bot mode:

1. Get a Recall.ai account + `RECALL_API_KEY` (needs a business email).
2. Deploy the worker (`Dockerfile.worker`, `npm run worker`) to Railway or any
   persistent container host. Note its public URL.
3. Set server env: `RECALL_API_KEY`, `RECALL_REGION`, `RECALL_WEBHOOK_SECRET`,
   `BOT_WORKER_PUBLIC_URL` (the worker URL), plus the existing Gemini / Cartesia /
   Firebase-admin vars the worker shares.
4. Set `MEETING_BOT_ENABLED = true` in `src/lib/features.ts` and redeploy the
   Next.js app so the "Join a Zoom/Meet call" button appears.
5. **First live run:** start the worker with `RECALL_DEBUG=1`, send the bot to a
   real Zoom/Meet link, and tune `src/lib/recall/client.ts` +
   `transcript-adapter.ts` to the actual Recall payloads from the debug logs.
6. Verify: bot joins → transcript turns appear with participant names → "Hey Kivo …"
   makes the bot **speak the answer into the call** → turns persist to Firestore.
7. Harden the webhook (Svix) before relying on it.

---

## Billing (deferred)

Intended model: **"host brings the bot, guests are free."** Not implemented.
