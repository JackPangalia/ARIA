export const MODEL_OPTIONS = [
  {
    id: "gemini-3.5-flash",
    label: "Standard",
    blurb: "Fast, insightful responses for most conversations.",
  },
  {
    id: "gemini-2.5-pro",
    label: "Pro",
    blurb: "Deeper reasoning. A little slower but more capable.",
  },
] as const;

export type ModelId = (typeof MODEL_OPTIONS)[number]["id"];

export const MODEL_IDS = MODEL_OPTIONS.map((m) => m.id) as readonly ModelId[];

export const DEFAULT_MODEL_ID: ModelId = "gemini-3.5-flash";

export function isValidModel(value: unknown): value is ModelId {
  return typeof value === "string" && (MODEL_IDS as readonly string[]).includes(value);
}

export function resolveModelId(
  override: ModelId | null | undefined,
  env: { GEMINI_MODEL: string; GEMINI_PRO_MODEL: string }
): string {
  if (override) return override;
  return env.GEMINI_MODEL;
}
