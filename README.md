# Kivo

Real-time AI voice participant for live, in-person conversations.

> Listen to a multi-person conversation in the room, keep a running
> speaker-attributed transcript, and — when someone says "Hey Kivo" — answer
> out loud, grounded in what was actually said.

Kivo V1 is **in-person only**: one microphone in a room, one assistant that
talks back. There is no meeting bot, no system-audio capture, and no Zoom/Meet
integration. See [Scope](#scope) below.

## Architecture

All heavy lifting is outsourced to APIs. The audio hot path runs
**browser ↔ provider**, so Vercel's serverless model is sufficient.

```
Browser mic
   │
   ▼
Web Audio (16 kHz mono int16)
   │
   ▼
Speechmatics Realtime WS (diarization + speaker identification)
   │
   ▼
Speaker-attributed transcript
   │
   │  (wake phrase detected in interim/final text)
   ▼
/api/ask ──► Claude (server-side web search) ──► Cartesia Sonic TTS (streaming PCM)
   │
   ▼
Browser plays the answer out loud
```

After a session stops, the same transcript feeds two post-hoc surfaces:

- **Overview summary** — a human-readable recap (overview, key points,
  decisions, action items) generated once on stop.
- **Chat** (parked) — text Q&A over the finished conversation via `/api/chat`
  is built but disabled (`SESSION_CHAT_ENABLED`). Same context builder as the
  live voice path; remount `MeetingChatPanel` when ready to ship.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind 4)
- **Speechmatics Realtime** — streaming transcription, diarization, and
  enrolled speaker identification for single-mic meetings
- **Anthropic Claude** — every model call: live answers (Haiku 4.5 / Sonnet 5),
  server-side web search, and background summaries. Called directly through the
  AI SDK (`ai` + `@ai-sdk/anthropic`), no agent framework in between
- **Cartesia Sonic** — low-latency streaming text-to-speech
- **Firebase** — auth and Firestore persistence
- **Zustand** — client state, **Zod** — schema and env validation

## Setup

```bash
npm install
cp .env.example .env.local
# Fill in keys (see links in .env.example)
npm run dev
```

### Required keys

- Anthropic API key — https://console.anthropic.com/settings/keys
- Speechmatics API key — https://portal.speechmatics.com/
- Cartesia API key — https://play.cartesia.ai/keys
- Firebase web app config — [Firebase Console](https://console.firebase.google.com/) → **aria-moserun-0512** → Project settings → Your apps → Web app → copy into `NEXT_PUBLIC_FIREBASE_*` in `.env.local`

  Or after `npx -y firebase-tools@latest login`:

  ```bash
  npx -y firebase-tools@latest apps:sdkconfig WEB --project aria-moserun-0512
  ```

  Map the SDK fields to the `NEXT_PUBLIC_FIREBASE_*` names in `.env.example`.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm test` | Vitest suite |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run voice:benchmark` | Voice latency benchmark |

## Wake phrase

There is no separate wake-word SDK. The browser streams mic audio to
Speechmatics and the app watches interim/final transcript text for wake phrases
like "Hey Kivo", "Hey Keevo", or "Hey Keyvo". If the phrase already contains a
question, Kivo answers immediately; if you only say "Hey Kivo", it treats the
next utterance as the question. Follow-ups within a short window need no wake
phrase.

## Speaker memory

Speechmatics speaker identifiers can be enrolled from Settings or mid-session
with phrases like "Hey Kivo, I'm Bob". Identifier strings are stored in
Firestore under the signed-in user and passed to future realtime sessions, so
known speakers appear by name in transcripts and context.

## Terminal transcript (local dev)

With `npm run dev`, final transcript lines and Kivo events print to that
terminal via `/api/dev-log` (development only).

## Desktop app

[`desktop/`](desktop/README.md) is an optional Electron menu-bar shell around
the same web app — tray icon, `Cmd+Shift+K` to open, and browser-to-app auth
hand-off. It is a convenience wrapper, not a separate product surface, and it
uses the same browser microphone path as the web app.

## Scope

Not in V1, and gated off in [`src/lib/features.ts`](src/lib/features.ts):

- **Meeting bot** (`MEETING_BOT_ENABLED`) — a bot that joins Zoom/Meet and
  speaks into the call. Built and verified, parked for V2.
- **App connectors** (`CONNECTORS_ENABLED`) — Composio OAuth into Notion,
  Gmail, Calendar, Slack. Built, parked for post-beta.

Removed outright:

- **Virtual meeting notes** — desktop system-audio capture of Zoom/Meet calls
  (a Granola-style notes product). Cut before launch to focus on the in-person
  experience. See [`AGENTS.md`](AGENTS.md).

Never built:

- Auto-interjection (Kivo deciding on its own when to speak)
- Use-case profiles / pre-briefing
