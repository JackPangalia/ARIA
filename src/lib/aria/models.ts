/** Fixed Kivo answer model — not user-selectable. */
export const KIVO_MODEL_ID = "gemini-2.5-flash";

export function resolveModelId(env: { GEMINI_MODEL: string }): string {
  return env.GEMINI_MODEL;
}
