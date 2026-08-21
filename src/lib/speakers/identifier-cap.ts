export const MAX_STORED_SPEAKER_IDENTIFIERS = 3;

function uniqueIdentifiers(identifiers: string[]): string[] {
  return Array.from(
    new Set(identifiers.map((identifier) => identifier.trim()).filter(Boolean))
  );
}

/** Explicit enrollment replaces the old print while enforcing the same cap everywhere. */
export function capSpeakerIdentifiers(identifiers: string[]): string[] {
  return uniqueIdentifiers(identifiers).slice(0, MAX_STORED_SPEAKER_IDENTIFIERS);
}

/**
 * Keep up to two established identifiers and rotate the newest real-session
 * sample into the final slot. This adds acoustic coverage without letting a
 * long history of corrections make Speechmatics matching increasingly broad.
 */
export function mergeLearnedSpeakerIdentifiers(
  existing: string[],
  incoming: string[]
): string[] {
  const current = capSpeakerIdentifiers(existing);
  const additions = uniqueIdentifiers(incoming).filter(
    (identifier) => !current.includes(identifier)
  );
  if (additions.length === 0) return current;

  const combined = uniqueIdentifiers([...current, ...additions]);
  if (combined.length <= MAX_STORED_SPEAKER_IDENTIFIERS) return combined;

  return [
    ...current.slice(0, MAX_STORED_SPEAKER_IDENTIFIERS - 1),
    additions[additions.length - 1]!,
  ];
}
