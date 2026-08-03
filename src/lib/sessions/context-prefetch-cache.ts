import type { buildContextBundle } from "@/lib/aria/context/build-context";
import { sanitizeQuestionText } from "@/lib/aria/context/question-text";

const DEFAULT_TTL_MS = 45_000;

export type PrefetchedContextBundle = Awaited<
  ReturnType<typeof buildContextBundle>
>;

interface PrefetchEntry {
  questionKey: string;
  bundle: PrefetchedContextBundle;
  expiresAt: number;
}

const cache = new Map<string, PrefetchEntry>();

function questionKey(question: string): string {
  return sanitizeQuestionText(question).toLowerCase();
}

function draftMatchesFinal(draft: string, finalQuestion: string): boolean {
  if (draft === finalQuestion) return true;
  if (draft.length >= 24 && finalQuestion.startsWith(draft)) return true;
  const draftWords = new Set(draft.split(/\s+/).filter(Boolean));
  const finalWords = new Set(finalQuestion.split(/\s+/).filter(Boolean));
  if (draftWords.size < 4 || finalWords.size < 4) return false;
  let overlap = 0;
  for (const word of draftWords) {
    if (finalWords.has(word)) overlap += 1;
  }
  return overlap / Math.max(draftWords.size, finalWords.size) >= 0.8;
}

export function storePrefetchedContext(
  sessionId: string,
  question: string,
  bundle: PrefetchedContextBundle
): void {
  cache.set(sessionId, {
    questionKey: questionKey(question),
    bundle,
    expiresAt: Date.now() + DEFAULT_TTL_MS,
  });
}

export function takePrefetchedContext(
  sessionId: string,
  question: string
): PrefetchedContextBundle | null {
  const entry = cache.get(sessionId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(sessionId);
    return null;
  }
  const finalKey = questionKey(question);
  if (!draftMatchesFinal(entry.questionKey, finalKey)) return null;
  cache.delete(sessionId);
  return {
    ...entry.bundle,
    // Search/context came from the near-final draft, but the model must receive
    // the exact settled question.
    question: sanitizeQuestionText(question),
  };
}

/** For tests only. */
export function resetContextPrefetchCacheForTests(): void {
  cache.clear();
}
