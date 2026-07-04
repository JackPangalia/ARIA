/**
 * Two-pass voice enrollment (~15s per pass at a natural pace).
 *
 * Pass 1 is based on the Rainbow Passage — widely used in speech/voice research
 * because it spans varied vowels, consonants, and intonation. Pass 2 is
 * unscripted conversational speech: read speech and spontaneous speech are
 * acoustically different registers, and sessions are matched against
 * conversation, not reading. Speechmatics recommends 5–30s of clear solo
 * speech per sample and multiple samples under different conditions.
 */
export interface EnrollmentPass {
  /** Short chip label above the script card. */
  label: string;
  /** Text shown in the script card while recording. */
  script: string;
}

export const ENROLLMENT_READ_ALOUD_SCRIPT =
  "When the sunlight strikes raindrops in the air, they act as a prism and form a rainbow. " +
  "The rainbow is a division of white light into many beautiful colors. " +
  "These take the shape of a long round arch, with its path high above, " +
  "and its two ends apparently beyond the horizon.";

export const ENROLLMENT_CONVERSATIONAL_PROMPT =
  "In your own words — no need to read anything — introduce yourself, " +
  "say what you do, and describe how your week has been going. " +
  "Keep talking naturally until the timer runs out.";

export const ENROLLMENT_PASSES: EnrollmentPass[] = [
  { label: "Read aloud", script: ENROLLMENT_READ_ALOUD_SCRIPT },
  { label: "Speak naturally", script: ENROLLMENT_CONVERSATIONAL_PROMPT },
];

export const ENROLLMENT_IDLE_HINT =
  "Two short recordings (15 seconds each) in a quiet room: one read aloud, one just talking.";
