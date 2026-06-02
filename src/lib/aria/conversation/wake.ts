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

// Settle windows for accumulating a spoken question after the wake word.
export const QUESTION_SETTLE_MS = 2800;
export const SPEECH_FINAL_SETTLE_MS = 2800;
// How long Kivo keeps listening for a follow-up (no wake word) after answering.
export const FOLLOW_UP_WINDOW_MS = 8000;

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

/** Meeting-bot only: catch Recall mishears regex misses (e.g. "kvio", "hey kevo"). */
function tokenSoundsLikeKivo(token: string): boolean {
  const t = normalizeToken(token);
  if (t.length < 2 || t.length > 9) return false;
  if (KIVO_ALIAS_SET.has(t)) return true;
  // Fuzzy only when the token plausibly starts like "Kivo" — avoids "video" etc.
  if (!/^[kqce]/.test(t) && t !== "evo") return false;
  return levenshtein(t, "kivo") <= 2;
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

export function isSubstantiveQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  return /[a-zA-Z0-9]/.test(trimmed);
}
