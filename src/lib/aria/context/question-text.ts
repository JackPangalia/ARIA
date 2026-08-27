import { KIVO_WAKE_TOKEN } from "@/lib/aria/conversation/wake";

const WAKE_PREFIX = new RegExp(`^(?:hey\\s+)?${KIVO_WAKE_TOKEN}[,!\\s]*`, "i");

const EARLY_SESSION_INTENT =
  /\b(beginning|start|started|first|originally|earlier|opening|initially)\b/i;

/** Collapse stuttered word/phrase repetitions from live STT. */
export function sanitizeQuestionText(text: string): string {
  let result = text.trim().replace(/\s+/g, " ");
  if (!result) return "";

  result = result.replace(WAKE_PREFIX, "").trim();

  // Remove consecutive duplicate words: "what what" -> "what"
  result = result.replace(/\b(\w+)(?:\s+\1\b)+/gi, "$1");

  // Remove consecutive duplicate 2–4 word phrases
  for (let n = 4; n >= 2; n--) {
    const pattern = new RegExp(
      `\\b((?:\\w+\\s+){${n - 1}}\\w+)(?:\\s+\\1\\b)+`,
      "gi"
    );
    result = result.replace(pattern, "$1");
  }

  return result.replace(/\s+/g, " ").trim();
}

export function hasEarlySessionSearchIntent(question: string): boolean {
  return EARLY_SESSION_INTENT.test(question);
}

/**
 * Function, deictic, and filler words long enough to clear the length filter.
 *
 * Without this, "what did I just say" searches on "what"/"just", "could go on"
 * searches on "could", and the hits land in the prompt right beside the live
 * question — which is how a conversational follow-up gets answered with a topic
 * from ten turns back. A short reply now retrieves nothing and the model reads
 * the conversation itself, which is where the answer actually is.
 *
 * The early-session hints ("beginning", "first", ...) are added after this
 * filter, so "what were we talking about at the beginning" still searches.
 */
const SEARCH_STOPWORDS = new Set([
  "about", "actually", "again", "alright", "also", "another", "anyone",
  "anything", "anyway", "back", "basically", "because", "been", "before",
  "being", "both", "cause", "come", "comes", "could", "does", "doesn't",
  "done", "dont", "don't", "each", "either", "even", "ever", "every",
  "everyone", "everything", "from", "gave", "give", "going", "gonna", "gotta",
  "guess", "have", "haven't", "having", "here", "into", "isn't", "just",
  "kind", "knew", "know", "knows", "like", "likes", "literally", "little",
  "lots", "made", "make", "makes", "many", "maybe", "mean", "means", "meant",
  "mine", "more", "most", "much", "must", "never", "nope", "nothing", "okay",
  "only", "onto", "other", "ours", "over", "probably", "real", "really",
  "right", "said", "same", "says", "saying", "should", "some", "somebody",
  "someone", "something", "sorry", "sort", "still", "stuff", "sure", "take",
  "takes", "talk", "talked", "talking", "talks", "tell", "telling", "tells",
  "than", "thats", "that's", "that", "their", "them", "then", "there",
  "these", "they", "thing", "things", "think", "thinking", "thinks", "this",
  "those", "thought", "took", "very", "wait", "want", "wanted", "wants",
  "wasn't", "well", "were", "weren't", "what", "whats", "what's", "when",
  "where", "which", "while", "whom", "whose", "will", "with", "without",
  "would", "yeah", "your", "youre", "you're", "yours",
]);

export function extractSearchTerms(question: string): string[] {
  const sanitized = sanitizeQuestionText(question).toLowerCase();
  const raw = sanitized.split(/[^a-z0-9']+/).filter(Boolean);
  const terms = new Set<string>();

  for (const word of raw) {
    if (word.length >= 4 && !SEARCH_STOPWORDS.has(word)) terms.add(word);
  }

  if (hasEarlySessionSearchIntent(sanitized)) {
    for (const hint of [
      "beginning",
      "start",
      "started",
      "first",
      "opening",
      "earlier",
    ]) {
      terms.add(hint);
    }
  }

  return [...terms];
}

export function questionsMatchForContext(a: string, b: string): boolean {
  const left = sanitizeQuestionText(a).toLowerCase();
  const right = sanitizeQuestionText(b).toLowerCase();
  if (!left || !right) return false;
  return left === right;
}
