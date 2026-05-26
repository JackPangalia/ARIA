/** Approximate chars per token for budgeting (conservative). */
export const CHARS_PER_TOKEN = 4;

/** Raw turns kept verbatim in model context. */
export const RECENT_TURN_COUNT = 20;

/** Unsummarized turn tokens that trigger compaction. */
export const COMPACTION_THRESHOLD_TOKENS = 8000;

/** Max tokens for assembled model context (excluding system prompt). */
export const CONTEXT_BUDGET_TOKENS = 12000;

/** Max search hits from older turns to inject. */
export const MAX_SEARCH_HITS = 5;

/** Preview length stored on session doc for list/search. */
export const SEARCH_PREVIEW_LENGTH = 500;
