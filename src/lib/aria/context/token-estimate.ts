import { CHARS_PER_TOKEN } from "@/lib/sessions/constants";

export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.ceil(trimmed.length / CHARS_PER_TOKEN);
}

export function estimateTokensForTexts(texts: string[]): number {
  return texts.reduce((sum, text) => sum + estimateTokens(text), 0);
}
