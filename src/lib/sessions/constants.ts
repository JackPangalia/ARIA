/** Approximate chars per token for budgeting (conservative). */
export const CHARS_PER_TOKEN = 4;

/** Raw turns kept verbatim in model context (questions now count as turns). */
export const RECENT_TURN_COUNT = 40;

/** Unsummarized turn tokens that trigger compaction. Kept well under the
 * context budget so summarization stays a fallback, not the main memory. */
export const COMPACTION_THRESHOLD_TOKENS = 16000;

/** Max tokens for assembled model context (excluding system prompt). */
export const CONTEXT_BUDGET_TOKENS = 30000;

/** Max project source tokens injected into the stable context prefix. */
export const PROJECT_SOURCES_TOKEN_BUDGET = 30000;

/** Hard cap for one extracted project source. Keeps each Firestore doc under 1MB. */
export const PROJECT_SOURCE_MAX_CHARS = 600000;

/** Max search hits from older turns to inject. */
export const MAX_SEARCH_HITS = 5;

/** Over-fetch multiplier when loading recent context turns (before role filter). */
export const CONTEXT_TURN_OVERFETCH = 4;

/** Max turns to scan when loading recent context or search. */
export const CONTEXT_TURN_SCAN_LIMIT = 200;

/** Preview length stored on session doc for list/search. */
export const SEARCH_PREVIEW_LENGTH = 500;
