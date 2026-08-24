/**
 * Speechmatics accepts "a maximum of 50 speaker identifiers across all
 * speakers" in one StartRecognition. Exceeding it fails the whole recognition,
 * not just the offending speaker — so with 25 profiles allowed by every plan,
 * a flat per-profile cap of 3 was already enough to break a session for a
 * heavy user. Nothing enforced the ceiling before this.
 *
 * Verified against the live API 2026-08-24: 25 speakers x 2 prints (50) starts
 * cleanly; 25 x 3 (75) dies with
 *   protocol_error: using more speaker identifiers (75) than allowed (50)
 * Note the ceiling counts identifiers, not speakers, and bogus identifier
 * strings are accepted at StartRecognition — a malformed print costs you a
 * match, not a session, so the only hard failure mode is the total.
 */
export const SPEECHMATICS_MAX_TOTAL_IDENTIFIERS = 50;

export interface SpeakerIdentifierSource {
  label: string;
  /** Priority order: anchors first, then oldest-to-newest live samples. */
  speakerIdentifiers: string[];
}

/**
 * Spends the identifier budget round-robin: every profile gets its first print
 * before any profile gets a second. Breadth beats depth here — a speaker with
 * one print can still be recognised, but a speaker with none can never be, so
 * starving the tail of the list to give the first profiles eight prints each
 * is strictly worse than an even spread.
 *
 * Profiles are consumed in the order given, so callers should pass them
 * most-relevant first; if there are more profiles than budget, the tail is
 * dropped entirely rather than sent with zero identifiers (which the API
 * rejects).
 */
export function selectSpeakerIdentifierBudget(
  profiles: SpeakerIdentifierSource[],
  budget: number = SPEECHMATICS_MAX_TOTAL_IDENTIFIERS
): SpeakerIdentifierSource[] {
  const usable = profiles.filter(
    (profile) => profile.speakerIdentifiers.length > 0
  );
  if (usable.length === 0 || budget <= 0) return [];

  const included = usable.slice(0, budget);
  const selected = included.map((profile) => ({
    label: profile.label,
    speakerIdentifiers: [] as string[],
  }));

  let spent = 0;
  const deepest = Math.max(
    ...included.map((profile) => profile.speakerIdentifiers.length)
  );
  for (let rank = 0; rank < deepest && spent < budget; rank += 1) {
    for (let i = 0; i < included.length && spent < budget; i += 1) {
      const identifier = included[i]!.speakerIdentifiers[rank];
      if (identifier == null) continue;
      selected[i]!.speakerIdentifiers.push(identifier);
      spent += 1;
    }
  }

  return selected;
}
