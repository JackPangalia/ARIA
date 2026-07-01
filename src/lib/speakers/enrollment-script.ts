/**
 * Read-aloud script for voice enrollment (~15s at a natural pace).
 *
 * Based on the Rainbow Passage — widely used in speech/voice research because it
 * spans varied vowels, consonants, and intonation. Speechmatics does not publish
 * a required script; they recommend 5–30s of clear solo speech. This passage is a
 * practical phonetically rich default versus repeating "hello" or ad‑lib intros.
 */
export const ENROLLMENT_READ_ALOUD_SCRIPT =
  "When the sunlight strikes raindrops in the air, they act as a prism and form a rainbow. " +
  "The rainbow is a division of white light into many beautiful colors. " +
  "These take the shape of a long round arch, with its path high above, " +
  "and its two ends apparently beyond the horizon.";

export const ENROLLMENT_SCRIPT_LABEL = "Read aloud";
export const ENROLLMENT_IDLE_HINT =
  "15 seconds in a quiet room. The passage appears when recording starts.";
