/** Fixed background-task model (summarize, auto-title, search subroutine) — not user-selectable. */
export const KIVO_MODEL_ID = "gemini-2.5-flash";

export function resolveModelId(env: { GEMINI_MODEL: string }): string {
  return env.GEMINI_MODEL;
}

/** User-selectable models for Kivo's live spoken answers (the "ask" model). */
export type AskModelId = "gemini-2.5-flash" | "claude-haiku-4-5" | "claude-sonnet-5";

export type AskModelProvider = "google" | "anthropic";

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
    id: "gemini-2.5-flash",
    provider: "google",
    apiModelId: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Fastest responses. Good default for a live conversation.",
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    apiModelId: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    description: "Balanced speed and conversational quality.",
  },
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    apiModelId: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    description: "Highest quality answers. Slower to respond.",
  },
] as const;

export const DEFAULT_ASK_MODEL_ID: AskModelId = "gemini-2.5-flash";

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
