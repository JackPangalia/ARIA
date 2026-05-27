const WAKE_PREFIX =
  /^(?:hey\s+)?aria[,!\s]*/i;

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

export function extractSearchTerms(question: string): string[] {
  const sanitized = sanitizeQuestionText(question).toLowerCase();
  const raw = sanitized.split(/[^a-z0-9']+/).filter(Boolean);
  const terms = new Set<string>();

  for (const word of raw) {
    if (word.length >= 4) terms.add(word);
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
