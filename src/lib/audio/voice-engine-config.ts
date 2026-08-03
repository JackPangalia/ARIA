export { VOICE_ENGINE_V2_ENABLED } from "@/lib/features";

export const VOICE_ENGINE_V2_TIMING = {
  // Silence before Speechmatics reports end-of-turn on its own. This is the
  // *slow* acoustic backstop: completed-sounding asks don't wait for it — the
  // engine's local VAD + semantic gate sends ForceEndOfUtterance the moment a
  // confident ask goes quiet. Raised per Speechmatics' voice-AI guidance
  // (0.5–0.8s) so mid-thought pauses survive the acoustic path.
  endOfUtteranceSilenceSeconds: 0.55,
  duckMs: 80,
  confirmMs: 180,
  primeMs: 80,
  playbackPrebufferMs: 80,
} as const;

