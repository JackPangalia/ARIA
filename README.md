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
Deepgram streaming WS (Nova-3 + diarization + "Hey ARIA" keyterm)
                                      │
                                      ▼
                         Speaker-attributed transcript
                                      │
                          (detect "Hey ARIA" in interim/final text)
                                      │
                                      ▼
            Next.js /api/ask  ──►  GPT-5.5 (Responses)
                                  ──►  OpenAI gpt-4o-mini-tts (mp3)
                                      │
                                      ▼
                              Browser plays audio
```

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind 4)
- **Deepgram** — streaming transcription + diarization
- **OpenAI GPT-5.5** — Responses API, streaming
- **OpenAI gpt-4o-mini-tts** — text-to-speech
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
- Deepgram API key — https://console.deepgram.com

### Wake phrase

ARIA no longer uses a separate wake-word SDK. The browser streams mic audio to
Deepgram, and the app watches interim/final transcript text for wake phrases
like "Hey ARIA", "Hey Arya", or "Hey Area". If the phrase includes a question,
ARIA answers that immediately; if you only say "Hey ARIA", it waits for the next
utterance as the question.

### Terminal transcript (local dev)

With `npm run dev`, final transcript lines and ARIA events are printed in that
terminal (via `/api/dev-log`, development only).

## What's NOT in the MVP

- Auto-interjection (ARIA decides when to speak on its own)
- Use-case profiles / pre-briefing
- Persistent storage / accounts
- Meeting bot (server-side audio capture from Zoom/Meet/Teams)

These are v2+ work and require a dedicated Node worker alongside Next.js.
