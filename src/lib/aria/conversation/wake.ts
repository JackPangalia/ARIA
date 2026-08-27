// Pure, transport-agnostic wake-word / question-capture helpers.
// Shared by the in-person browser engine (src/lib/audio/aria-engine.ts) and the
// Recall meeting-bot worker so the logic is single-sourced and never diverges.

/**
 * ASR spellings that mean "Kivo" (k-i-v-o). In-person Speechmatics maps these to
 * "Kivo" via additional_vocab. Meeting mode uses fuzzy matching on top because
 * Recall low-latency ASR has no key_terms bias.
 */
export const KIVO_WAKE_TOKEN =
  "(?:kivo|keevo|keyvo|quivo|kevo|kiva|kibo|kiwo|kievo|kvio|kivio|klivo|vivo|evo|ki\\s+vo|kee\\s+vo|key\\s+vo|qui\\s+vo)";

export const WAKE_PATTERNS = [
  new RegExp(
    `\\b(?:hey|hi|okay|ok)\\s*,?\\s*${KIVO_WAKE_TOKEN}\\b[\\s,.:;!?-]*`,
    "i"
  ),
  new RegExp(`^\\s*${KIVO_WAKE_TOKEN}\\b[\\s,.:;!?-]*`, "i"),
];

const WAKE_GREETING = /^(?:hey|hi|okay|ok)$/i;

// Close phrases that end conversation mode. The name "Kivo" is required so an
// offhand "thank you" mid-conversation never closes the loop. Built from the
// same KIVO_WAKE_TOKEN spellings so ASR mishears still match.
export const CLOSE_PATTERNS = [
  new RegExp(`\\bthanks?(?:\\s+you)?\\s*,?\\s*${KIVO_WAKE_TOKEN}\\b`, "i"),
  new RegExp(`\\bthank\\s+you\\s*,?\\s*${KIVO_WAKE_TOKEN}\\b`, "i"),
];

/** True when the utterance is a "thank you, Kivo" style close phrase. */
export function detectCloseWord(text: string): boolean {
  return CLOSE_PATTERNS.some((pattern) => pattern.test(text));
}

const STOP_WORD =
  "(?:stop|shut\\s+up|that(?:'s|\\s+is)\\s+enough|thank\\s+you|thanks)";
// "just"/"please"/"okay" commonly prefix a stop command ("just shut up",
// "okay stop"); people also repeat themselves when frustrated ("shut up shut
// up") — both are folded into STOP_CORE so a single whole-utterance check
// catches them without extra call sites.
const STOP_FILLER = "(?:okay|ok|just|please)";
const STOP_CONNECTOR = "[\\s,.:;!?-]+";
const STOP_CORE = `(?:${STOP_FILLER}${STOP_CONNECTOR})*${STOP_WORD}(?:${STOP_CONNECTOR}(?:${STOP_FILLER}${STOP_CONNECTOR})*${STOP_WORD})*`;

export const STOP_PATTERNS = [
  new RegExp(`^\\s*${STOP_CORE}[\\s,.:;!?-]*$`, "i"),
  new RegExp(
    `^\\s*(?:(?:hey|hi|okay|ok)[\\s,.:;!?-]*)?${KIVO_WAKE_TOKEN}[\\s,.:;!?-]*${STOP_CORE}[\\s,.:;!?-]*$`,
    "i"
  ),
  new RegExp(
    `^\\s*${STOP_CORE}[\\s,.:;!?-]*${KIVO_WAKE_TOKEN}[\\s,.:;!?-]*$`,
    "i"
  ),
];

const STRICT_STOP_PATTERNS = STOP_PATTERNS.slice(1);

export function detectStopWord(
  text: string,
  options: { requireWakeWord?: boolean } = {}
): boolean {
  const patterns = options.requireWakeWord ? STRICT_STOP_PATTERNS : STOP_PATTERNS;
  return patterns.some((pattern) => pattern.test(text));
}

function lastNonEmptyClause(text: string): string {
  const parts = text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : text.trim();
}

/**
 * Checks only the final clause of a longer utterance for a stop command. Used
 * for utterances where Kivo's own echo has merged with real speech into one
 * Speechmatics final (e.g. "...goal of the app. Stop.") — the stop word is
 * real regardless of what came before it in the same utterance. Utterances
 * with no sentence boundary (a single clause) are left to the whole-utterance
 * check instead, so this never turns an unrelated long sentence into a match.
 */
export function detectTrailingStop(text: string): boolean {
  const trimmed = text.trim();
  const clause = lastNonEmptyClause(trimmed);
  if (!clause || clause === trimmed) return false;
  return detectStopWord(clause);
}

const KIVO_ALIAS_SET = new Set(
  [
    "kivo",
    "keevo",
    "keyvo",
    "quivo",
    "kevo",
    "kiva",
    "kibo",
    "kiwo",
    "kievo",
    "kvio",
    "kivio",
    "klivo",
    "vivo",
    "evo",
    "kiv",
    "quivo",
  ].map((s) => s.toLowerCase())
);

// Settle windows for accumulating a spoken question after the wake word. These
// are the *fallback* used while the speaker is still mid-utterance, or when the
// provider never reports end-of-turn.
export const QUESTION_SETTLE_MS = 1500;
export const SPEECH_FINAL_SETTLE_MS = 1500;
// Once Speechmatics reports end-of-turn (an EndOfUtterance message, fired after
// `end_of_utterance_silence_trigger` of silence) we already know the speaker
// stopped. Collapse the long settle to this short grace — enough to allow an
// immediate continuation, but far quicker than waiting the full settle from the
// last transcript. Best case fast, worst case (no EndOfUtterance) unchanged.
// Kept comfortably above a natural mid-sentence thinking pause: too low and a
// beat of silence gets answered before the speaker has actually finished.
export const END_OF_UTTERANCE_GRACE_MS = 550;
// When the captured question *reads* unfinished (trailing "and", a comma, a
// filler), the speaker is pausing to think, not done — hold the dispatch this
// much longer so a mid-thought breath doesn't get answered as a question.
export const INCOMPLETE_TAIL_GRACE_MS = 1500;

// Words that essentially never end a finished spoken question. A tail landing
// on one of these means the sentence is still open ("...and the", "what about
// the", "should we use React or..."). Deliberately conservative: only words
// that are ungrammatical sentence-enders — bare verbs/nouns stay "complete"
// so normal questions keep the fast path.
const INCOMPLETE_TAIL_WORDS = new Set([
  // conjunctions / connectors
  "and", "or", "but", "so", "because", "if", "when", "while", "whereas",
  "than", "then", "versus", "vs", "plus", "also", "either", "neither",
  // prepositions
  "to", "of", "for", "with", "without", "in", "on", "at", "by", "from",
  "about", "into", "onto", "over", "under", "between", "through", "after",
  "before", "during", "against", "toward", "towards", "like",
  // determiners / possessives (demonstratives like "that"/"this" excluded —
  // they legitimately end questions: "how do we fix that")
  "the", "a", "an", "my", "your", "his", "her", "its", "our", "their",
  "some", "each", "every",
  // relative pronouns mid-clause
  "which", "whose",
  // auxiliaries left hanging ("do you think we should...")
  "is", "are", "was", "were", "be", "been", "being", "am",
  "do", "does", "did", "have", "has", "had",
  "can", "could", "should", "would", "will", "shall", "may", "might", "must",
  // fillers
  "um", "uh", "umm", "uhh", "er", "erm", "ah", "hmm", "uhm",
]);

// Bare interrogatives dangling at the end of an *unpunctuated* draft. "Tell me
// what", "who do you think is going to" and "walk me through how" are all
// sentences still in flight — the speaker has named the question word but not
// the question. Unlike INCOMPLETE_TAIL_WORDS these are only suspicious without
// terminal punctuation, because plenty of finished questions legitimately end
// on one ("so what?", "I don't know why."). Speechmatics punctuates, so the
// terminal mark is a reliable discriminator.
//
// This is what let "What? Tell me what" grade as a clear directive ask and
// force an endpoint half a second into a thinking pause — cutting the speaker
// off, then answering the fragment with "you're cutting off there".
const TRAILING_INTERROGATIVE_WORDS = new Set([
  "what", "who", "whom", "how", "why", "where", "when", "whether",
]);

/**
 * Semantic endpointing: does the captured question look unfinished? Checked
 * when the STT provider reports end-of-turn — silence alone doesn't mean the
 * thought is complete, so an open-ended tail extends the dispatch grace
 * instead of firing after a thinking pause.
 */
export function looksIncompleteQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Trailing punctuation that opens rather than closes: comma, colon,
  // semicolon, dash, ellipsis.
  if (/(?:[,:;-]|\.\.\.|…)$/.test(trimmed)) return true;
  const lastToken = trimmed
    .toLowerCase()
    .replace(/[.!?…]+$/, "")
    .split(/\s+/)
    .pop();
  if (!lastToken) return false;
  const word = lastToken.replace(/[^a-z']/g, "");
  if (INCOMPLETE_TAIL_WORDS.has(word)) return true;
  const punctuated = /[.!?]$/.test(trimmed);
  return !punctuated && TRAILING_INTERROGATIVE_WORDS.has(word);
}
// How long Kivo keeps listening for a follow-up (no wake word) after answering.
export const FOLLOW_UP_WINDOW_MS = 8000;
// In-person conversation mode: after Kivo answers, briefly accept the next
// utterance without a wake word. If the room stays quiet, return to passive
// listening quickly rather than leaving the orb on "Follow-up".
//
// This measures *silence only* — the engine holds the window open for as long
// as someone is actually speaking (see `holdFollowUpWindow` in aria-engine),
// so it decides how long you have to *start* a follow-up, never how long you
// have to finish one. At 3s a normal beat of thought after an answer ran out
// before the question was even spoken.
export const CONVERSATION_WINDOW_MS = 4_000;
// After the open floor closes, the conversation is not over — it just gets
// pickier. For this much longer, Kivo still takes a wake-free turn, but only
// from an utterance that reads as a question or directive aimed at it
// (`clear-ask` / `likely-ask`); a statement in the room stays transcript.
//
// This exists because the open floor is measured from the end of Kivo's
// answer, and a person listens to a forty-second answer before deciding what
// to ask. "Did it win any awards?" landing eight seconds later is the single
// most ordinary thing a person can say, and a hard four-second cut-off met it
// with silence.
//
// The orb stays on "Follow-up" for the whole window, tail included — it is
// still listening, so it still says so. Showing passive listening while a
// follow-up would in fact be taken made the UI lie about what Kivo was doing.
export const CONVERSATION_TAIL_MS = 25_000;

export function extractQuestionAfterWake(text: string): {
  detected: boolean;
  question: string;
} {
  for (const pattern of WAKE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    return {
      detected: true,
      question: text.slice(match.index + match[0].length).trim(),
    };
  }
  return { detected: false, question: "" };
}

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z]/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, row[j]!, row[j - 1]!);
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/** Catch ASR mishears the alias regex misses (e.g. "kvio", "hey kevo").
 * `maxDistance` 2 suits Recall's unbiased low-latency ASR; in-person
 * Speechmatics already vocab-biases toward "Kivo", so 1 avoids false wakes on
 * words like "kind". */
function tokenSoundsLikeKivo(token: string, maxDistance = 2): boolean {
  const t = normalizeToken(token);
  if (t.length < 2 || t.length > 9) return false;
  if (KIVO_ALIAS_SET.has(t)) return true;
  // Fuzzy only when the token plausibly starts like "Kivo" — avoids "video" etc.
  if (!/^[kqce]/.test(t) && t !== "evo") return false;
  return levenshtein(t, "kivo") <= maxDistance;
}

/**
 * Meeting-bot wake detection: strict patterns first, then fuzzy token scan on
 * partial/final Recall transcripts (low-latency ASR has no vocabulary bias).
 */
export function extractQuestionAfterWakeMeeting(text: string): {
  detected: boolean;
  question: string;
} {
  const strict = extractQuestionAfterWake(text);
  if (strict.detected) return strict;

  const tokens = text.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i]!.replace(/^[,]+/, "").replace(/[,.:;!?-]+$/g, "");
    const prev =
      i > 0 ? tokens[i - 1]!.replace(/[,.:;!?-]+$/g, "") : "";
    const withGreeting = i > 0 && WAKE_GREETING.test(prev);
    const atUtteranceStart = i === 0;

    if ((atUtteranceStart || withGreeting) && tokenSoundsLikeKivo(raw)) {
      return {
        detected: true,
        question: tokens.slice(i + 1).join(" ").trim(),
      };
    }
  }

  return { detected: false, question: "" };
}

/**
 * In-person wake detection: strict patterns first, then a tight fuzzy check
 * confined to the utterance start (bare or after a greeting). Tighter than the
 * meeting variant on both position and edit distance because Speechmatics
 * already biases toward "Kivo" via additional_vocab — this only rescues the
 * near-miss spellings that slip past both the vocab bias and the alias list.
 */
export function extractQuestionAfterWakeInPerson(text: string): {
  detected: boolean;
  question: string;
} {
  const strict = extractQuestionAfterWake(text);
  if (strict.detected) return strict;

  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { detected: false, question: "" };

  const first = tokens[0]!.replace(/[,.:;!?-]+$/g, "");
  const idx = tokens.length > 1 && WAKE_GREETING.test(first) ? 1 : 0;
  const candidate = tokens[idx]!
    .replace(/^[,]+/, "")
    .replace(/[,.:;!?-]+$/g, "");

  if (tokenSoundsLikeKivo(candidate, 1)) {
    return {
      detected: true,
      question: tokens.slice(idx + 1).join(" ").trim(),
    };
  }
  return { detected: false, question: "" };
}

export function isSubstantiveQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  return /[a-zA-Z0-9]/.test(trimmed);
}
