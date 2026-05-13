import { webSearchTool, type Tool } from "@openai/agents";

// Cheap heuristic: does this question look like it might need fresh / external
// info? If not, we skip attaching the web search tool so the model doesn't
// spend a round-trip considering it.
const SEARCH_HINT_PATTERNS: RegExp[] = [
  /\b(latest|today|tonight|tomorrow|yesterday|this (?:week|month|year)|currently|right now|breaking|news|update|recent|just (?:announced|released|happened))\b/i,
  /\b(price|stock|ticker|market|score|weather|forecast|temperature|traffic)\b/i,
  /\b(who (?:is|won|leads|leading)|what (?:is|are) the (?:price|score|weather|status))\b/i,
  /\b(search|google|look up|find out|cite|source|reference)\b/i,
  /\b20\d{2}\b/, // explicit recent-year mention
];

function questionLikelyNeedsSearch(question: string): boolean {
  return SEARCH_HINT_PATTERNS.some((re) => re.test(question));
}

export function getAriaTools(question?: string): Tool[] {
  if (question && !questionLikelyNeedsSearch(question)) {
    return [];
  }
  return [
    webSearchTool({
      searchContextSize: "low",
      externalWebAccess: true,
    }),
  ];
}
