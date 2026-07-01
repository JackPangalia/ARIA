const DEFAULT_MAX_SPEAKERS = 10;
const ENROLLED_SPEAKER_SENSITIVITY = 0.2;

export function preferCurrentSpeakerForProfiles(profileCount: number): boolean {
  return true;
}

export function speakerSensitivityForProfiles(profileCount: number): number | undefined {
  if (profileCount === 0) return undefined;
  return ENROLLED_SPEAKER_SENSITIVITY;
}

export function maxSpeakersForProfiles(profileCount: number): number {
  if (profileCount === 0) return DEFAULT_MAX_SPEAKERS;
  return Math.min(DEFAULT_MAX_SPEAKERS, Math.max(2, profileCount + 1));
}
