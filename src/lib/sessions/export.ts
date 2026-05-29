import type { SessionDetailResponse } from "@/lib/sessions/types";
import { formatTurnForContext } from "@/lib/sessions/repository";

export function exportSessionMarkdown(detail: SessionDetailResponse): string {
  const { session, turns, summary, facts, pins } = detail;
  const lines: string[] = [
    `# ${session.title}`,
    "",
    `- Status: ${session.status}`,
    `- Created: ${session.createdAt}`,
    `- Updated: ${session.updatedAt}`,
    `- Speakers: ${session.speakerCount}`,
    "",
  ];

  if (summary?.rollingSummary) {
    lines.push("## Summary", "", summary.rollingSummary, "");
  }

  if (facts.length > 0) {
    lines.push(
      "## Key facts",
      "",
      ...facts.map((fact) => `- [${fact.category}] ${fact.text}`),
      ""
    );
  }

  if (pins.length > 0) {
    lines.push(
      "## Pins",
      "",
      ...pins.map((pin) => `- ${pin.label}: ${pin.snippet}`),
      ""
    );
  }

  lines.push("## Transcript", "");
  for (const turn of turns) {
    lines.push(formatTurnForContext(turn, { unregisteredLabel: "Other speaker" }), "");
  }

  return lines.join("\n").trim() + "\n";
}

export function exportSessionJson(detail: SessionDetailResponse): string {
  return JSON.stringify(detail, null, 2);
}
