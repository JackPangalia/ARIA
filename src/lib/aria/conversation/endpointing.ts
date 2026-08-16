// Semantic endpointing: decide from the words — not just the silence — whether
// the speaker is done and expects an answer.
//
// Once Kivo is addressed, a finished thought is a turn — not only a question
// mark. Unfinished tails still hold so a mid-thought pause is not answered.
// The first wake-turn is slightly more patient on unpunctuated statements
// (a briefing pause after "Hey Kivo") than a follow-up, where you are already
// in the conversation.
//
// While the speaker keeps talking, every new transcript reschedules the timer
// and local VAD cancels pending sends — so holds don't add latency to a
// flowing ramble; they only decide how much silence ends it.

import { looksIncompleteQuestion } from "./wake";

export type QuestionCompleteness =
  /** The last clause is a clear, directed ask — send almost immediately. */
  | "clear-ask"
  /** Question-shaped but unpunctuated — probably an ask; short beat. */
  | "likely-ask"
  /** Finished thought or yield closer — a turn, even without a question. */
  | "complete-turn"
  /** Unpunctuated statement — briefing context on the first wake; a turn on follow-up. */
  | "statement"
  /** Openly unfinished (trailing connector, tiny draft) — definitely hold. */
  | "unfinished";

/**
 * Residual grace after Speechmatics already reported end-of-turn (the 0.55s
 * acoustic silence has elapsed). First-wake values; follow-ups use
 * {@link graceMsFor}.
 */
export const END_OF_UTTERANCE_GRACE_MS: Record<QuestionCompleteness, number> = {
  "clear-ask": 80,
  "likely-ask": 250,
  "complete-turn": 400,
  statement: 900,
  unfinished: 2400,
};

const FOLLOW_UP_EOU_GRACE_MS: Record<QuestionCompleteness, number> = {
  "clear-ask": 80,
  "likely-ask": 250,
  "complete-turn": 400,
  statement: 550,
  unfinished: 1800,
};

/**
 * Fallback settle from the last final transcript, for when the provider's
 * end-of-turn never arrives. Longer than the grace tiers because it has to
 * absorb transcript latency, but graded the same way. First-wake values;
 * follow-ups use {@link settleMsFor}.
 */
export const SETTLE_MS: Record<QuestionCompleteness, number> = {
  "clear-ask": 600,
  "likely-ask": 700,
  "complete-turn": 900,
  statement: 1400,
  unfinished: 2800,
};

const FOLLOW_UP_SETTLE_MS: Record<QuestionCompleteness, number> = {
  "clear-ask": 500,
  "likely-ask": 600,
  "complete-turn": 750,
  statement: 1000,
  unfinished: 2200,
};

/** Re-arm delay when local VAD hears speech end but no transcript event has
 * rescheduled dispatch yet — a safety net, not the primary path (the
 * dispatch-time re-grade upgrades it if the draft reads unfinished). */
export const LOCAL_SPEECH_END_SETTLE_MS = 900;

export function graceMsFor(
  completeness: QuestionCompleteness,
  followUp: boolean
): number {
  return (followUp ? FOLLOW_UP_EOU_GRACE_MS : END_OF_UTTERANCE_GRACE_MS)[
    completeness
  ];
}

export function settleMsFor(
  completeness: QuestionCompleteness,
  followUp: boolean
): number {
  return (followUp ? FOLLOW_UP_SETTLE_MS : SETTLE_MS)[completeness];
}

/** Force Speechmatics to finalize now. Only confident asks and yield closers
 * — a breath after a punctuated sentence is not a send. Never unfinished,
 * never a briefing statement; those wait for the 0.55s acoustic EOU. */
export function shouldForceEndpoint(
  completeness: QuestionCompleteness,
  text: string
): boolean {
  if (completeness === "clear-ask" || completeness === "likely-ask") return true;
  if (completeness === "complete-turn" && draftEndsWithYield(text)) return true;
  return false;
}

/** Pre-warm generation on completed-looking drafts so first audio is already
 * in flight during the acoustic wait. Playback still waits for endpoint
 * confirm. First-wake statements and unfinished drafts never fire. */
export function shouldSpeculateAsk(
  completeness: QuestionCompleteness,
  followUp: boolean
): boolean {
  if (completeness === "unfinished") return false;
  if (completeness === "statement") return followUp;
  return true;
}

export function draftEndsWithYield(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return isYieldCloser(finalClause(trimmed));
}

const INTERROGATIVE_OPENERS =
  /^(?:what|what's|how|how's|why|when|where|who|who's|which|whose|can|could|should|would|will|shall|do|does|did|is|are|was|were|am|have|has|had|may|might|must|anyone|anybody)\b/i;

// Directed imperatives — the speaker is telling Kivo to do something, which is
// as clear an ask as a question mark.
const DIRECTIVE_OPENERS =
  /^(?:tell|give|explain|describe|list|name|summarize|summarise|compare|remind|show|walk|help|find|search|look|check|calculate|draft|write|suggest|recommend|brainstorm|define|translate|convert|estimate|read|repeat|say)\b/i;

const YIELD_CLOSER_PHRASES = new Set([
  "yeah",
  "yep",
  "yup",
  "alright",
  "all right",
  "alright yeah",
  "all right yeah",
  "okay yeah",
  "ok yeah",
  "that's it",
  "that is it",
  "anyway",
  "so yeah",
]);

const COMPLETE_TURN_MIN_WORDS = 5;

/** The clause that decides the turn: everything after the last sentence
 * boundary, or the whole draft if there is none. A ramble's earlier sentences
 * are context; only the ending tells us whether an answer is expected now. */
function finalClause(text: string): string {
  const parts = text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : text.trim();
}

function normalizeClause(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isYieldCloser(clause: string): boolean {
  return YIELD_CLOSER_PHRASES.has(normalizeClause(clause));
}

/**
 * Grade whether the captured draft reads like a completed turn.
 * Judged on the *final clause* — "okay so pricing is a mess. what should we
 * charge?" must grade on the question, not the ramble that led to it.
 */
export function assessQuestionCompleteness(
  text: string
): QuestionCompleteness {
  const trimmed = text.trim();
  if (!trimmed) return "unfinished";
  if (looksIncompleteQuestion(trimmed)) return "unfinished";

  const clause = finalClause(trimmed);
  const clauseWords = clause.toLowerCase().split(/\s+/).filter(Boolean);

  // The STT provider punctuates; a terminal question mark is the strongest
  // possible "I'm asking you" signal.
  if (/\?$/.test(trimmed)) return "clear-ask";

  // A directive aimed at Kivo ("give me the short version", "compare the two
  // options") is a completed ask even without punctuation.
  if (DIRECTIVE_OPENERS.test(clause) && clauseWords.length >= 3) {
    return "clear-ask";
  }

  // Question-shaped final clause without the "?" — probably an ask, but give
  // it a short beat in case the shape is a wh-cleft ("what we need is…").
  if (INTERROGATIVE_OPENERS.test(clause) && clauseWords.length >= 4) {
    return "likely-ask";
  }

  // "Alright yeah" / "that's it" — the speaker yielded the turn.
  if (isYieldCloser(clause)) return "complete-turn";

  // A tiny draft with no punctuation is still in flight — STT finals lag the
  // end-of-turn signal, and one or two words are rarely the whole ask.
  const draftWords = trimmed.split(/\s+/).filter(Boolean);
  if (draftWords.length < 3 && !/[.!?]$/.test(trimmed)) return "unfinished";

  // Punctuated, long enough, not incomplete — a finished thought.
  if (/[.!]$/.test(trimmed) && draftWords.length >= COMPLETE_TURN_MIN_WORDS) {
    return "complete-turn";
  }

  return "statement";
}
