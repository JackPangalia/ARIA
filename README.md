# ARIA — AI Interactive Real-Time Assistant

Real-time AI voice participant for live, multi-person conversations.
This repo is the MVP described in `docs/mvp` (concept docs in chat history):

> Listen to a multi-person dialogue, produce a running speaker-attributed
> transcript, and — when prompted with a question — return a spoken response
> grounded in the conversation.

## Architecture (MVP)

All heavy lifting is outsourced to APIs. The audio hot path runs
**browser ↔ provider** so Vercel's serverless model is sufficient.

```
Browser mic
   │
   ▼
Browser Web Audio (16 kHz mono int16)
   │
   ▼
Speechmatics Realtime WS (diarization + speaker identification)
                                      │
                                      ▼
                         Speaker-attributed transcript
                                      │
                          (detect "Hey Kivo" in interim/final text)
                                      │
                                      ▼
            Next.js /api/ask  ──►  Gemini 2.5 (Agents SDK)
                                  ──►  Cartesia Sonic TTS (mp3)
                                      │
                                      ▼
                              Browser plays audio
```

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind 4)
- **Speechmatics Realtime** — streaming transcription, diarization, and enrolled speaker identification for single-mic meetings
- **Google Gemini 2.5** — Kivo agent (flash / pro), Google Search grounding, streaming
- **Cartesia Sonic** — low-latency text-to-speech
- **Zustand** — client state, **Zod** — env validation

## Setup

```bash
npm install
cp .env.example .env.local
# Fill in keys (see links in .env.example)
npm run dev
```

### Required keys

- OpenAI API key — https://platform.openai.com/api-keys
- Speechmatics API key — https://portal.speechmatics.com/
- Firebase web app config — [Firebase Console](https://console.firebase.google.com/) → **aria-moserun-0512** → Project settings → Your apps → Web app → copy into `NEXT_PUBLIC_FIREBASE_*` in `.env.local`

  Or after `npx -y firebase-tools@latest login`:

  ```bash
  npx -y firebase-tools@latest apps:sdkconfig WEB --project aria-moserun-0512
  ```

  Map the SDK fields to the `NEXT_PUBLIC_FIREBASE_*` names in `.env.example`.

### Wake phrase

ARIA no longer uses a separate wake-word SDK. The browser streams mic audio to
Speechmatics, and the app watches interim/final transcript text for wake phrases
like "Hey Kivo", "Hey Keevo", or "Hey Keyvo". If the phrase includes a question,
Kivo answers that immediately; if you only say "Hey Kivo", it waits for the next
utterance as the question.

### Speaker memory

Speechmatics speaker identifiers can be enrolled from Settings or during a live
session with phrases like "Hey Kivo, I'm Bob". ARIA stores the identifier strings
in Firestore under the signed-in user and passes them to future realtime sessions
so known speakers appear by name in transcripts and context.

### Terminal transcript (local dev)

With `npm run dev`, final transcript lines and ARIA events are printed in that
terminal (via `/api/dev-log`, development only).

## What's NOT in the MVP

- Auto-interjection (Kivo decides when to speak on its own)
- Use-case profiles / pre-briefing
- Persistent storage / accounts
- Meeting bot (server-side audio capture from Zoom/Meet/Teams)

These are v2+ work and require a dedicated Node worker alongside Next.js.
