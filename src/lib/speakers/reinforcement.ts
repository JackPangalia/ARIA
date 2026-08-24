import type { SessionSpeakerClusterSnapshot } from "@/lib/speakers/session-learning";

/**
 * How much speech a profile must carry, in one recognition stream, before we
 * fold that stream's voiceprint back into it. Corrections were the only way a
 * profile ever learned, which meant every session the system got *right*
 * taught it nothing — the profile stayed frozen at whatever the enrollment
 * booth captured, while the person's real acoustics drifted with the room,
 * the mic, and how they happen to be sitting.
 *
 * 90 seconds is deliberately long. A brief misattribution is common and
 * recoverable; a wrong label that holds for a minute and a half of continuous
 * speech, uncorrected by a user watching the live transcript, is rare enough
 * that learning from it is the better bet.
 */
export const AUTO_LEARN_MIN_SPEECH_MS = 90_000;

export interface ReinforcementCandidate {
  providerSpeakerLabel: string;
  profileId: string;
  profileName: string;
  /** Newest print from the cluster — the most refined one it produced. */
  identifier: string;
}

export interface ReinforcementInput {
  clusters: SessionSpeakerClusterSnapshot[];
  /** Attributed, non-echo speech per provider label in this stream. */
  attributedMsByLabel: ReadonlyMap<string, number>;
  /** Provider label -> enrolled profile it resolved to. */
  profilesByLabel: ReadonlyMap<string, { id: string; name: string }>;
  /** Labels the user corrected this session — their clusters are suspect. */
  correctedLabels: ReadonlySet<string>;
  /** Profile ids already reinforced this session. */
  alreadyReinforced: ReadonlySet<string>;
  minSpeechMs?: number;
}

/**
 * Picks clusters that have earned a voiceprint update. A cluster qualifies
 * when it resolved to an enrolled profile, carried enough speech, was never
 * corrected by the user, and hasn't already contributed this session — one
 * sample per profile per session keeps a single long meeting from flooding
 * the rotating pool with eight near-identical prints from one acoustic setup.
 */
export function selectReinforcementCandidates(
  input: ReinforcementInput
): ReinforcementCandidate[] {
  const minSpeechMs = input.minSpeechMs ?? AUTO_LEARN_MIN_SPEECH_MS;
  const seen = new Set<string>();
  const candidates: ReinforcementCandidate[] = [];

  for (const cluster of input.clusters) {
    const label = cluster.providerSpeakerLabel;
    const profile = input.profilesByLabel.get(label);
    if (!profile) continue;
    if (input.correctedLabels.has(label)) continue;
    if (input.alreadyReinforced.has(profile.id) || seen.has(profile.id)) continue;
    if ((input.attributedMsByLabel.get(label) ?? 0) < minSpeechMs) continue;

    const identifier = cluster.speakerIdentifiers.at(-1);
    if (!identifier) continue;

    seen.add(profile.id);
    candidates.push({
      providerSpeakerLabel: label,
      profileId: profile.id,
      profileName: profile.name,
      identifier,
    });
  }

  return candidates;
}
