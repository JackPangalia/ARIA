# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A host in a physical room with other people. They put a laptop or phone in the middle, start Kivo, and talk. The job is to ask the room's voice agent a question out loud and have it answer the room, the way someone would use ChatGPT voice — except this has to work in a meeting, with more than one speaker.

Secondary: the same host later, alone, opening a past session to read what was said.

## Product Purpose

Kivo is an in-person voice agent for multi-person sessions. It listens to the room, answers out loud when asked, and leaves a summary and transcript when the conversation ends.

Success is a group choosing Kivo for the next discussion because the spoken exchange was useful — not because the screen was a notes app.

## Positioning

ChatGPT voice, but for meetings. General voice assistants are one-to-one. Meeting-notetakers capture and summarize but are not a shared speaker in the room. Kivo is the thing in the middle that the whole room can talk to.

## Operating Context

V1 is in-person only: browser microphone in, answer out local speakers, wake phrase "Hey Kivo". The session lives in a web app (also wrapped in a desktop shell). After stop, the existing meeting summary is generated and the owner can read Summary and Transcript.

The marketing landing page is a separate surface and stays as it is.

## Capabilities and Constraints

Confirmed in product:

- Shared spoken answers in a multi-person room.
- Live session is orb-first: listening state, timer, stop, and a compact caption of what Kivo heard and what it is saying.
- After stop: Summary + Transcript only (existing Overview).
- Voice engine quality (endpointing, barge-in, Anthropic answers, wake word) stays.
- Landing page stays.

Parked — built or sketched, not the V1 identity, not mounted as the live surface:

- Notes-first workspace, personal notes, enhanced notes, private Ask Kivo chat (uncommitted 2026-09-07).
- Whiteboard / canvas (planned, never shipped; Excalidraw removed).
- Older typed session chat (`SESSION_CHAT_ENABLED`, `docs/archive/chat-mode`).
- Meeting-bot mode and app connectors (already hard-disabled).

Undecided: whether parked notes/chat code is deleted later or left in the tree behind the same pattern as connectors.

## Brand Commitments

Name: Kivo. Wake phrase: Hey Kivo.

Binding restore target for the in-app live look: the particle orb and tinted, ChatGPT-like minimal session in `public/landing/app-ui.png`, `public/landing/app-ui-v2.png`, and `public/landing/app-listening.png`. The cream/serif Claude-projects home and the notes document as the live page are not the product.

Landing imagery and copy stay. Do not restyle the marketing site to match a product-UI restore.

## Evidence on Hand

- Last committed live session (HEAD `0367356`, 2026-09-01): centered orb overlay, `ListeningCaption`, Overview after stop.
- Particle orb implementation still in tree: `src/components/aria/OrbParticles.tsx` (desktop widget + same family as the landing orb). Session currently uses `GlowOrb` instead.
- In-app screenshots of the older aesthetic: `public/landing/app-ui.png`, `app-ui-v2.png`, `app-listening.png`.
- Claude-editorial home capture: `output/hub-polish-20260828/desktop.png`.
- This weekend's notes-first direction: `docs/notes-first-workspace.md` (uncommitted). Whiteboard plan: `docs/live-session-workspace-plan.md` (superseded, not built).
- 2026-09-08 critique of the orb-era workspace: distinctiveness is the spoken exchange, not another visual system.

No customer testimonials or usage metrics are on file. Do not invent them.

## Product Principles

1. The room is the product. If the screen competes with the conversation, cut the screen.
2. Speak to the group. Personal notes and private chat never feed a spoken answer.
3. Keep the recap; do not become a notebook. Summary and transcript are the after. The live surface is the agent.
4. Park, don't ship, product bets that change the category (notes, canvas, workspace chat, bot, connectors).
5. Landing and app may diverge. Marketing stays cinematic; the app goes back to the quiet orb.
