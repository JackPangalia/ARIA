/**
 * Shared Sonic generation guidance. Omit `emotion` and `speed` so the model
 * infers delivery from punctuation and wording — locking `calm` / 0.95 made
 * every answer sound even and slightly dragged. Volume stays at unity.
 * Per-turn SSML emotion tags are beta and mismatch badly; do not add them here.
 */
export const KIVO_CARTESIA_GENERATION_CONFIG = {
  volume: 1,
} as const;
