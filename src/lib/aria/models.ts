/**
 * Fixed background-task model (rolling summaries, auto-titles, meeting
 * summaries) — not user-selectable. These run off the critical path, so the
 * cheapest capable model wins.
 */
export const KIVO_MODEL_ID = "claude-haiku-4-5";

/** User-selectable models for Kivo's live spoken answers (the "ask" model). */
export type AskModelId = "claude-haiku-4-5" | "claude-sonnet-5";

export type AskModelProvider = "anthropic";

export interface AskModelOption {
  id: AskModelId;
  provider: AskModelProvider;
  /** Model id as passed to the provider's SDK. */
  apiModelId: string;
  label: string;
  description: string;
}

export const ASK_MODELS: readonly AskModelOption[] = [
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    apiModelId: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    description: "Fastest to respond. Less reliable on questions that need a web search.",
  },
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    apiModelId: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    description:
      "The default. Sharper answers and far steadier about searching before it speaks.",
  },
] as const;

/**
 * Sonnet, not Haiku: Haiku decides whether to search at the first token with
 * thinking disabled, and gets it wrong often enough to answer current-events
 * questions from memory. Sonnet's slower first token is largely absorbed by the
 * spoken search hand-off, which starts audio before the answer is ready.
 */
export const DEFAULT_ASK_MODEL_ID: AskModelId = "claude-sonnet-5";

export function isAskModelId(value: unknown): value is AskModelId {
  return (
    typeof value === "string" &&
    ASK_MODELS.some((option) => option.id === value)
  );
}

export function getAskModelOption(
  id: AskModelId | null | undefined
): AskModelOption {
  const found = id ? ASK_MODELS.find((option) => option.id === id) : null;
  return found ?? ASK_MODELS.find((option) => option.id === DEFAULT_ASK_MODEL_ID)!;
}

/**
 * Coerce a persisted answer-model preference to a model we still serve.
 * `gemini-2.5-flash` was a selectable option before the Anthropic
 * consolidation, so stored preferences in `users/{uid}/private/plan` can still
 * name it; those read as the default rather than erroring. Mirrors
 * `parseSessionMode`'s handling of the removed `"virtual"` session mode.
 */
export function parseAnswerModel(value: unknown): AskModelId {
  return isAskModelId(value) ? value : DEFAULT_ASK_MODEL_ID;
}
