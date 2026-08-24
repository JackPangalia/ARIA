import { MAX_STORED_SPEAKER_IDENTIFIERS } from "@/lib/speakers/identifier-cap";

const DEFAULT_MAX_SPEAKERS = 10;
// Decision threshold, not accuracy. The provider's own framing: "a higher
// sensitivity will increase the likelihood of more unique speakers returning."
// So *lower* rounds ambiguous voices into an enrolled profile, *higher* spins
// them out as a new generic speaker. 0.2 caused guests to be force-matched to
// enrolled labels on short first utterances — and the provider's online
// clustering then self-reinforces that mistake for the rest of the stream.
const THIN_PROFILE_SENSITIVITY = 0.4;
// Vendor default. A profile carrying prints from several sessions matches on
// its own merits, so we can stop leaning on a permissive threshold — which is
// what keeps a guest from being absorbed into an enrolled name. Only applied
// when *every* enrolled profile is rich: the setting is global, so the
// thinnest profile in the room decides what the config has to accommodate.
const RICH_PROFILE_SENSITIVITY = 0.5;
// Prints a profile needs before it counts as rich. Half the storage cap means
// a speaker has been heard in at least a few distinct sittings.
const RICH_PROFILE_IDENTIFIERS = Math.ceil(MAX_STORED_SPEAKER_IDENTIFIERS / 2);
// Cluster slots for unenrolled voices. The provider applies max_speakers to
// generic speakers *only* — enrolled labels don't consume it — so this is a
// flat allowance, not a function of how many people are enrolled. Guests need
// somewhere to land, and Kivo's own TTS audio also occupies a cluster (the mic
// streams during playback so stop-commands work).
const UNENROLLED_SPEAKER_HEADROOM = 6;

export function preferCurrentSpeakerForProfiles(): boolean {
  return true;
}

/**
 * @param identifierCounts one entry per enrolled profile, its voiceprint count.
 */
export function speakerSensitivityForProfiles(
  identifierCounts: number[]
): number | undefined {
  if (identifierCounts.length === 0) return undefined;
  const allRich = identifierCounts.every(
    (count) => count >= RICH_PROFILE_IDENTIFIERS
  );
  return allRich ? RICH_PROFILE_SENSITIVITY : THIN_PROFILE_SENSITIVITY;
}

export function maxSpeakersForProfiles(profileCount: number): number {
  if (profileCount === 0) return DEFAULT_MAX_SPEAKERS;
  return UNENROLLED_SPEAKER_HEADROOM;
}
