import {
  SUPPORTED_TOOLKITS,
  type SupportedToolkit,
} from "@/lib/composio/connections";

/** Plain substring hints → toolkit slug (not regex). */
const SYNONYM_TO_TOOLKIT: Record<string, SupportedToolkit> = {
  email: "gmail",
  mail: "gmail",
  inbox: "gmail",
  calendar: "googlecalendar",
  schedule: "googlecalendar",
  meeting: "googlecalendar",
  spreadsheet: "googlesheets",
  sheet: "googlesheets",
  doc: "googledocs",
  document: "googledocs",
  drive: "googledrive",
  file: "googledrive",
  task: "clickup",
  tasks: "clickup",
  message: "slack",
  channel: "slack",
};

function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/\s+/g, " ");
}

/**
 * Which connector toolkits to attach for this question.
 * Empty array = conversational — no Composio tools in the prompt.
 */
export function resolveConnectorToolkits(question: string): SupportedToolkit[] {
  const haystack = normalizeQuestion(question);
  if (!haystack.trim()) return [];

  const matched = new Set<SupportedToolkit>();

  for (const { slug, label } of SUPPORTED_TOOLKITS) {
    if (haystack.includes(slug)) {
      matched.add(slug);
    }
    const labelLower = label.toLowerCase();
    if (labelLower.length >= 3 && haystack.includes(labelLower)) {
      matched.add(slug);
    }
  }

  for (const [hint, toolkit] of Object.entries(SYNONYM_TO_TOOLKIT)) {
    if (haystack.includes(hint)) {
      matched.add(toolkit);
    }
  }

  return [...matched].sort();
}
