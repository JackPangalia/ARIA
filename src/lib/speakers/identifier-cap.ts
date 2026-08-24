/**
 * How many voiceprints we keep per profile. A speaker matches best when their
 * enrolled set spans the acoustic conditions they actually get recorded in —
 * one read-aloud print in a quiet room does not describe the same person
 * leaning back in a noisy meeting. The old cap of 3 meant a profile could
 * never accumulate that spread; the guard against over-broad matching is now
 * anchor protection plus `speaker_sensitivity` (see diarization-config), not
 * starving the profile.
 */
export const MAX_STORED_SPEAKER_IDENTIFIERS = 8;

/**
 * Slots reserved for prints captured during explicit enrollment, where we know
 * the audio was that speaker alone. These are never evicted by live-session
 * learning, so a bad auto-learn degrades matching instead of destroying the
 * profile — the user can always get back to a clean state by re-enrolling.
 */
export const MAX_ANCHOR_IDENTIFIERS = 3;

/**
 * How many identifiers a *learn* request may carry. This is an input cap, not
 * a storage cap: a live cluster accumulates a fresh voiceprint from every
 * `SpeakersResult` snapshot (one per 30s), so by the time a user taps a name
 * mid-session the cluster holds far more than we keep. The server still
 * narrows to the storage cap via mergeLearnedSpeakerIdentifiers — validating
 * the request against the storage cap rejected every real correction after
 * ~90 seconds of audio.
 */
export const MAX_LEARN_SPEAKER_IDENTIFIERS = 50;

function uniqueIdentifiers(identifiers: string[]): string[] {
  return Array.from(
    new Set(identifiers.map((identifier) => identifier.trim()).filter(Boolean))
  );
}

/**
 * Explicit enrollment replaces the old print set. Enrollment prints are
 * anchors, so this caps at the anchor budget rather than the full profile.
 */
export function capSpeakerIdentifiers(identifiers: string[]): string[] {
  return uniqueIdentifiers(identifiers).slice(0, MAX_ANCHOR_IDENTIFIERS);
}

/**
 * Newest samples from a live cluster, oldest dropped. Cluster merges append,
 * so the tail is the most recent (and most refined) voiceprint. Trimming here
 * keeps the request small — each identifier is a multi-KB embedding.
 */
export function recentClusterIdentifiers(identifiers: string[]): string[] {
  return uniqueIdentifiers(identifiers).slice(-MAX_LEARN_SPEAKER_IDENTIFIERS);
}

/**
 * Anchors for a stored profile. Profiles written before anchors existed have
 * no recorded count; treating their leading prints as anchors is the safe
 * reading, since those are the ones that came from enrollment.
 */
export function resolveAnchorCount(
  identifiers: string[],
  storedAnchorCount: number | null | undefined
): number {
  const fallback = Math.min(identifiers.length, MAX_ANCHOR_IDENTIFIERS);
  if (storedAnchorCount == null || !Number.isFinite(storedAnchorCount)) {
    return fallback;
  }
  return Math.max(0, Math.min(Math.floor(storedAnchorCount), identifiers.length));
}

export interface MergedSpeakerIdentifiers {
  identifiers: string[];
  /** Leading entries of `identifiers` that came from explicit enrollment. */
  anchorCount: number;
}

/**
 * Folds new room samples into a profile. Anchors stay put; everything after
 * them is a rotating FIFO of live samples, newest kept. A profile therefore
 * broadens toward the conditions it keeps being heard in without ever losing
 * the clean prints it was enrolled with.
 */
export function mergeLearnedSpeakerIdentifiers(
  existing: string[],
  incoming: string[],
  storedAnchorCount?: number | null
): MergedSpeakerIdentifiers {
  const current = uniqueIdentifiers(existing);
  const anchorCount = resolveAnchorCount(current, storedAnchorCount);
  const anchors = current.slice(0, anchorCount);
  const learned = current.slice(anchorCount);

  const additions = uniqueIdentifiers(incoming).filter(
    (identifier) => !current.includes(identifier)
  );

  // A profile created by naming a cluster in the transcript has no enrollment
  // pass behind it. Its first prints are the best evidence it will ever have,
  // so they become its anchors rather than rotating away immediately.
  if (current.length === 0) {
    const seeded = additions.slice(-MAX_STORED_SPEAKER_IDENTIFIERS);
    return {
      identifiers: seeded,
      anchorCount: Math.min(seeded.length, MAX_ANCHOR_IDENTIFIERS),
    };
  }

  if (additions.length === 0) {
    return { identifiers: current, anchorCount };
  }

  const learnedRoom = Math.max(0, MAX_STORED_SPEAKER_IDENTIFIERS - anchors.length);
  const rotated = [...learned, ...additions].slice(-learnedRoom);
  return { identifiers: [...anchors, ...rotated], anchorCount: anchors.length };
}
