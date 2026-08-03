// Semantic endpointing: decide from the words — not just the silence — whether
// the speaker is done and expects an answer.
//
// The governing policy (matching how Claude voice feels in practice):
// **patience is the default; only a clear, directed ask earns the instant
// send.** People ramble their way to a question — "okay so we've been working
// on the pricing page. and the thing is conversion dropped. so what should we
// change?" — and every sentence along the way sounds "finished". A
// finished-sounding *statement* is not a request for an answer; it's context
// being built. So statements hold long, and only the final clause looking like
// an actual ask (question mark, interrogative shape, or a directive) collapses
// the wait to near-zero.
//
// While the speaker keeps talking, every new transcript reschedules the timer
// and local VAD cancels pending sends — so long holds don't add latency to a
// flowing ramble; they only decide how much silence ends it.

import { looksIncompleteQuestion } from "./wake";

export type QuestionCompleteness =
  /** The last clause is a clear, directed ask — send almost immediately. */
  | "clear-ask"
  /** Question-shaped but unpunctuated — probably an ask; short beat. */
  | "likely-ask"
  /** Reads like a statement/fragment — context on the way to a point. Hold. */
  | "statement"
  /** Openly unfinished (trailing connector, tiny draft) — definitely hold. */
  | "unfinished";

/**
 * Grace applied after the STT provider reports end-of-turn (which already
 * implies the endpoint silence has elapsed).
 */
export const END_OF_UTTERANCE_GRACE_MS: Record<QuestionCompleteness, number> = {
  "clear-ask": 80,
  "likely-ask": 500,
  statement: 1700,
  unfinished: 2400,
};

/**
 * Fallback settle from the last final transcript, for when the provider's
 * end-of-turn never arrives. Longer than the grace tiers because it has to
 * absorb transcript latency, but graded the same way.
 */
export const SETTLE_MS: Record<QuestionCompleteness, number> = {
  "clear-ask": 700,
  "likely-ask": 1100,
  statement: 2300,
  unfinished: 3000,
};

/** Re-arm delay when local VAD hears speech end but no transcript event has
 * rescheduled dispatch yet — a safety net, not the primary path (the
 * dispatch-time re-grade upgrades it if the draft reads unfinished). */
export const LOCAL_SPEECH_END_SETTLE_MS = 900;

const INTERROGATIVE_OPENERS =
  /^(?:what|what's|how|how's|why|when|where|who|who's|which|whose|can|could|should|would|will|shall|do|does|did|is|are|was|were|am|have|has|had|may|might|must|anyone|anybody)\b/i;

// Directed imperatives — the speaker is telling Kivo to do something, which is
// as clear an ask as a question mark.
const DIRECTIVE_OPENERS =
  /^(?:tell|give|explain|describe|list|name|summarize|summarise|compare|remind|show|walk|help|find|search|look|check|calculate|draft|write|suggest|recommend|brainstorm|define|translate|convert|estimate|read|repeat|say)\b/i;

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

/**
 * Grade whether the captured draft reads like a completed, directed ask.
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

  // A tiny draft with no punctuation is still in flight — STT finals lag the
  // end-of-turn signal, and one or two words are rarely the whole ask.
  const draftWords = trimmed.split(/\s+/).filter(Boolean);
  if (draftWords.length < 3 && !/[.!?]$/.test(trimmed)) return "unfinished";

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

  // Everything else — closed statements, fragments — is context being built
  // on the way to a point. Hold; if the speaker truly stops, the long timer
  // sends the whole accumulated draft, which is what they addressed to Kivo.
  return "statement";
}
