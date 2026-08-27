/**
 * Decides what to do with an incoming `user_question` that begins with the
 * words of the question turn right before it.
 *
 * Speechmatics re-delivers settled speech inside a longer final once the
 * speaker keeps going, so one spoken thought can reach the ask path several
 * times, each pass carrying the words already asked plus a new tail. What the
 * transcript should show depends on whether the earlier pass was ever answered
 * out loud:
 *
 * - Every answer in between was cut off → nobody heard a complete reply, so
 *   the passes are one question. Rewrite the earlier turn and drop the
 *   fragments ("supersede").
 * - An answer in between ran to completion → that Q&A really happened. Keep
 *   it and persist only the new tail, so the answered half isn't asked twice
 *   ("trim").
 * - The tail adds nothing → a pure re-delivery. Fold it into the existing turn
 *   and write nothing new ("fold").
 */

export type TurnLike = {
  id: string;
  role: string;
  text: string;
  interrupted?: boolean;
};

export type QuestionFold =
  | { mode: "append" }
  | { mode: "supersede"; targetId: string; text: string; dropTurnIds: string[] }
  | { mode: "trim"; text: string }
  | { mode: "fold"; targetId: string };

const WORD_RE = /[a-z0-9']+/g;

/** Words plus where each one starts in the original string. */
function words(text: string): { word: string; at: number }[] {
  const out: { word: string; at: number }[] = [];
  const lower = text.toLowerCase();
  for (const m of lower.matchAll(WORD_RE)) {
    out.push({ word: m[0], at: m.index });
  }
  return out;
}

/**
 * How many words the two passes may disagree on and still be the same thought.
 *
 * Speechmatics does not re-deliver settled speech verbatim: the longer final is
 * a fresh decode of the same audio, so a filler word appears or vanishes
 * ("...tell me? Okay, so this is what happened" → "...tell me? so this is what
 * happened") and a word near the old boundary gets a second guess. Matching
 * word-for-word, one dropped "okay" was enough to read the second pass as a
 * brand new question — which is how one spoken sentence became two transcript
 * turns with a cut-off Kivo fragment wedged between them.
 *
 * The budget scales with length because a short question has no room to spare:
 * under four words, one changed word is most of the question, so those still
 * have to match exactly.
 */
function editBudget(previousWordCount: number): number {
  if (previousWordCount < 4) return 0;
  return Math.min(3, Math.max(1, Math.floor(previousWordCount / 6)));
}

/**
 * Aligns every word of `previous` against the start of `incoming`, allowing up
 * to `budget` insertions, deletions, or substitutions.
 *
 * Returns how many words of `incoming` the earlier question accounts for — the
 * point the new tail starts at — or null if the two don't line up within the
 * budget. Of the alignments that use the fewest edits, the one consuming the
 * fewest incoming words wins, so a genuinely new tail is never swallowed as
 * padding.
 */
function alignedPrefixLength(
  previous: string[],
  incoming: string[],
  budget: number
): number | null {
  const maxCols = Math.min(incoming.length, previous.length + budget);
  // row[j] = edits to align previous[0..i) with incoming[0..j).
  let row = Array.from({ length: maxCols + 1 }, (_, j) => j);

  for (let i = 1; i <= previous.length; i += 1) {
    const next = new Array<number>(maxCols + 1);
    next[0] = i;
    for (let j = 1; j <= maxCols; j += 1) {
      const substitution = row[j - 1]! + (previous[i - 1] === incoming[j - 1] ? 0 : 1);
      next[j] = Math.min(substitution, row[j]! + 1, next[j - 1]! + 1);
    }
    row = next;
  }

  let bestEdits = Number.POSITIVE_INFINITY;
  let bestLength: number | null = null;
  for (let j = 0; j <= maxCols; j += 1) {
    if (row[j]! < bestEdits) {
      bestEdits = row[j]!;
      bestLength = j;
    }
  }
  return bestEdits <= budget ? bestLength : null;
}

/**
 * @param recent Turns newest-first, as stored (a handful is enough — the scan
 *   stops at the first non-answer turn).
 * @param text The incoming question text.
 */
export function decideQuestionFold(
  recent: TurnLike[],
  text: string
): QuestionFold {
  const dropTurnIds: string[] = [];
  let answerWasHeard = false;

  for (const turn of recent) {
    if (turn.role === "assistant") {
      // A completed answer is history: the speaker heard a reply to the
      // shorter question, so the earlier turn stays.
      if (turn.interrupted) dropTurnIds.push(turn.id);
      else answerWasHeard = true;
      continue;
    }
    if (turn.role !== "user_question") return { mode: "append" };

    const previous = turn.text.trim();
    if (!previous) return { mode: "append" };

    const incomingWords = words(text);
    const previousWords = words(previous);
    const budget = editBudget(previousWords.length);
    if (
      previousWords.length === 0 ||
      incomingWords.length + budget < previousWords.length
    ) {
      return { mode: "append" };
    }
    const consumed = alignedPrefixLength(
      previousWords.map((w) => w.word),
      incomingWords.map((w) => w.word),
      budget
    );
    if (consumed === null) return { mode: "append" };

    const tail = text.slice(incomingWords[consumed]?.at ?? text.length).trim();
    if (!tail) return { mode: "fold", targetId: turn.id };
    if (answerWasHeard) return { mode: "trim", text: tail };
    return { mode: "supersede", targetId: turn.id, text: text.trim(), dropTurnIds };
  }

  return { mode: "append" };
}
