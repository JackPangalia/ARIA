export { VOICE_ENGINE_V2_ENABLED } from "@/lib/features";

export const VOICE_ENGINE_V2_TIMING = {
  // Silence before Speechmatics reports end-of-turn on its own. This is the
  // acoustic backstop, and now the primary end-of-turn signal for anything
  // short of an unambiguous ask: only `clear-ask` drafts still short-circuit it
  // with ForceEndOfUtterance. Sits at the top of Speechmatics' voice-AI band
  // (0.5–0.8s) and must stay below `max_delay` (1.0). At 0.55 a normal
  // mid-sentence thinking pause read as end-of-turn and got answered; the
  // graded grace after it was trimmed to keep total time-to-answer flat.
  endOfUtteranceSilenceSeconds: 0.8,
  duckMs: 80,
  // Room-tested 2026-08-22: 180ms let any ambient voice in the room (not just
  // the person Kivo is listening to) confirm a hard interrupt, since this path
  // has no transcript corroboration — see `handleAcousticBargeIn`. Raised so a
  // stray word or someone else answering their phone ducks (cheap, reversible)
  // but doesn't kill the answer; a real interruption still confirms well under
  // a second.
  confirmMs: 450,
  primeMs: 80,
  playbackPrebufferMs: 80,
} as const;

