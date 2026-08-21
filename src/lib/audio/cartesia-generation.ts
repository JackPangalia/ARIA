/**
 * Default delivery for every Kivo synthesis request. Sonic otherwise infers
 * emotion from punctuation and wording, which can over-act ordinary answers.
 */
export const KIVO_CARTESIA_GENERATION_CONFIG = {
  emotion: "calm",
  speed: 0.95,
  volume: 1,
} as const;
