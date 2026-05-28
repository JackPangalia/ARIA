import { sanitizeQuestionText } from "@/lib/aria/context/question-text";

/** User explicitly asked to search the web. */
const EXPLICIT_SEARCH =
  /\b(?:search|google|look\s+up|look\s+it\s+up|find\s+out\s+online|check\s+online|on\s+the\s+web)\b/i;

/** Needs fresh external facts (news, markets, weather, dates). */
const TIME_SENSITIVE =
  /\b(?:latest|today|tonight|tomorrow|yesterday|this\s+(?:week|month|year)|currently|right\s+now|breaking|news|headlines|update|recent|just\s+(?:announced|released|happened))\b/i;

/** Current-events / world questions (not casual room chat). */
const CURRENT_EVENTS =
  /\b(?:global\s+situation|current\s+events|world\s+affairs|in\s+the\s+world|geopolitic|international\s+news|world\s+news|news\s+today)\b/i;

const WORLD_GOING_ON = /\bwhat(?:'s|s|\s+is)\s+going\s+on\b/i;

const FACTUAL_LOOKUP =
  /\b(?:price|stock|ticker|market\s+cap|score|weather|forecast|temperature|traffic)\b/i;

const YEAR_MENTION = /\b20\d{2}\b/;

/**
 * Attach Google Search only when the question needs live external facts
 * or the user explicitly asked to search — not for normal room chat.
 */
export function questionLikelyNeedsSearch(question: string): boolean {
  const q = sanitizeQuestionText(question);
  if (!q) return false;

  if (EXPLICIT_SEARCH.test(q)) return true;
  if (TIME_SENSITIVE.test(q)) return true;
  if (CURRENT_EVENTS.test(q)) return true;
  if (FACTUAL_LOOKUP.test(q)) return true;
  if (YEAR_MENTION.test(q)) return true;

  if (
    WORLD_GOING_ON.test(q) &&
    /\b(?:world|globally|news|geopolitic)\b/i.test(q)
  ) {
    return true;
  }

  return false;
}
