import type {
  CleanedTranscriptDoc,
  CleanedTranscriptTurn,
  TurnDoc,
} from "@/lib/sessions/types";

/**
 * Longest turn the cleaner may drop outright. Cutting "Hello?" is the point;
 * silently losing a paragraph because the model judged it unimportant is not.
 */
const MAX_DROPPABLE_CHARS = 30;

/** Only human speech is cleaned. Assistant turns are already model-written
 * text, so a rewrite pass could only damage them. */
export function isCleanableTurn(turn: TurnDoc): boolean {
  return turn.role === "speaker" || turn.role === "user_question";
}

function speakerKey(turn: TurnDoc): string {
  return turn.speakerName ?? `#${turn.speaker ?? "?"}`;
}

/**
 * Keeps only the entries we can safely trust, given the model is free-forming
 * both the grouping and the text.
 *
 * Rejected: unknown or already-used ids (invented or duplicated), merges that
 * span speakers (which would put words in someone else's mouth), and empty
 * text. A rejected entry isn't fatal — its raw turns simply survive unchanged,
 * because `applyCleanedTranscript` falls back to any turn nothing covers.
 */
export function validateCleanedTurns(
  batch: TurnDoc[],
  candidates: Array<{ sourceIds: string[]; text: string }>,
  /** Position of every turn in the full transcript, assistant turns included.
   * Merges must be contiguous there: two questions with an answer between them
   * are separate turns, however similar they look side by side. */
  position?: Map<string, number>
): CleanedTranscriptTurn[] {
  const byId = new Map(batch.map((turn) => [turn.id, turn]));
  const order = position ?? new Map(batch.map((turn, i) => [turn.id, i]));
  const used = new Set<string>();
  // Ids the model referenced at all, including in entries we go on to reject.
  // A rejected entry is our judgement, not the model choosing to drop filler,
  // so those turns are always restored below regardless of length.
  const referenced = new Set<string>();
  const accepted: CleanedTranscriptTurn[] = [];

  for (const candidate of candidates) {
    for (const id of candidate.sourceIds) {
      if (byId.has(id)) referenced.add(id);
    }
    const sources = candidate.sourceIds
      .map((id) => byId.get(id))
      .filter((turn): turn is TurnDoc => Boolean(turn));
    if (sources.length !== candidate.sourceIds.length) continue;
    if (sources.length === 0) continue;
    if (sources.some((turn) => used.has(turn.id))) continue;

    const speakers = new Set(sources.map(speakerKey));
    if (speakers.size > 1) continue;

    // Reject a merge that jumps over a turn it didn't include — most often
    // Kivo answering between two questions.
    const positions = sources
      .map((turn) => order.get(turn.id) ?? -1)
      .sort((a, b) => a - b);
    const contiguous = positions.every(
      (value, index) => index === 0 || value === positions[index - 1] + 1
    );
    if (!contiguous) continue;

    const text = candidate.text.trim();
    if (!text) continue;

    for (const turn of sources) used.add(turn.id);
    accepted.push({ sourceTurnIds: sources.map((turn) => turn.id), text });
  }

  // A turn the model never mentioned was dropped as filler. Allow that only
  // for short ones; anything substantial, or anything we rejected ourselves,
  // is put back rather than lost.
  for (const turn of batch) {
    if (used.has(turn.id)) continue;
    const droppable =
      !referenced.has(turn.id) &&
      turn.text.trim().length <= MAX_DROPPABLE_CHARS;
    if (droppable) continue;
    accepted.push({ sourceTurnIds: [turn.id], text: turn.text });
  }

  return accepted.sort(
    (a, b) =>
      (order.get(a.sourceTurnIds[0]) ?? 0) - (order.get(b.sourceTurnIds[0]) ?? 0)
  );
}

/** A display turn, which may stand for several raw turns that were merged. */
export type ReadableTurn = TurnDoc & { sourceTurnIds: string[] };

/**
 * Builds the readable transcript by overlaying cleaned entries onto the raw
 * turns, in raw order.
 *
 * Merged entries take their identity (speaker, role, timestamps) from the
 * first raw turn they cover, and carry every covered id so a speaker
 * correction still reaches all of them. Raw turns no cleaned entry covers pass
 * through untouched, so a partial or failed clean degrades to the raw
 * transcript rather than losing anything.
 */
export function applyCleanedTranscript(
  turns: TurnDoc[],
  cleaned: CleanedTranscriptDoc | null
): ReadableTurn[] {
  const passthrough = (turn: TurnDoc): ReadableTurn => ({
    ...turn,
    sourceTurnIds: [turn.id],
  });
  if (!cleaned || cleaned.turns.length === 0) return turns.map(passthrough);

  const byFirstId = new Map<string, CleanedTranscriptTurn>();
  const covered = new Set<string>();
  for (const entry of cleaned.turns) {
    const [first] = entry.sourceTurnIds;
    if (!first) continue;
    byFirstId.set(first, entry);
    for (const id of entry.sourceTurnIds) covered.add(id);
  }

  const readable: ReadableTurn[] = [];
  for (const turn of turns) {
    const entry = byFirstId.get(turn.id);
    if (entry) {
      readable.push({
        ...turn,
        text: entry.text,
        sourceTurnIds: entry.sourceTurnIds,
      });
      continue;
    }
    // Covered by an earlier merged entry, or dropped as filler.
    if (covered.has(turn.id)) continue;
    if (isCleanableTurn(turn)) continue;
    readable.push(passthrough(turn));
  }

  return readable;
}
