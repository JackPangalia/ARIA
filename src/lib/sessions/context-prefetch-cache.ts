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
  if (entry.questionKey !== questionKey(question)) return null;
  cache.delete(sessionId);
  return entry.bundle;
}

/** For tests only. */
export function resetContextPrefetchCacheForTests(): void {
  cache.clear();
}
