const DEFAULT_MAX_SPEAKERS = 10;
// Decision threshold, not accuracy: lower values round ambiguous voices into
// enrolled profiles, higher values round them into new generic speakers.
// 0.2 caused guests to be force-matched to enrolled labels on short first
// utterances — and the provider's online clustering then self-reinforces that
// mistake for the rest of the stream. 0.4 keeps a mild bias toward enrolled
// speakers (vendor default is 0.5) while letting an unsure match fall out as
// "Speaker N", which is recoverable, instead of a confident wrong name, which
// is not.
const ENROLLED_SPEAKER_SENSITIVITY = 0.4;
// Cluster slots beyond the enrolled profiles: unenrolled guests need somewhere
// to land, and Kivo's own TTS audio also occupies a cluster (the mic streams
// during playback so stop-commands work). With only one spare slot, a guest's
// voice had nowhere to go but an enrolled label.
const UNENROLLED_SPEAKER_HEADROOM = 3;

export function preferCurrentSpeakerForProfiles(profileCount: number): boolean {
  return true;
}

export function speakerSensitivityForProfiles(profileCount: number): number | undefined {
  if (profileCount === 0) return undefined;
  return ENROLLED_SPEAKER_SENSITIVITY;
}

export function maxSpeakersForProfiles(profileCount: number): number {
  if (profileCount === 0) return DEFAULT_MAX_SPEAKERS;
  return Math.min(
    DEFAULT_MAX_SPEAKERS,
    profileCount + UNENROLLED_SPEAKER_HEADROOM
  );
}
