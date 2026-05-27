export const MODEL_OPTIONS = [
  {
    id: "gpt-5.4-mini",
    label: "Standard",
    blurb: "Fast responses. Great for most conversations.",
  },
  {
    id: "gpt-5.5",
    label: "Pro",
    blurb: "Deeper reasoning. A little slower but more capable.",
  },
] as const;

export type ModelId = (typeof MODEL_OPTIONS)[number]["id"];

export const MODEL_IDS = MODEL_OPTIONS.map((m) => m.id) as readonly ModelId[];

export const DEFAULT_MODEL_ID: ModelId = "gpt-5.4-mini";

export function isValidModel(value: unknown): value is ModelId {
  return typeof value === "string" && (MODEL_IDS as readonly string[]).includes(value);
}
