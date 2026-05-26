import type { SessionDoc, SessionSummaryDoc } from "@/lib/sessions/types";

export function getSessionSummaryText(
  summary: SessionSummaryDoc | null,
  session: SessionDoc
): string {
  if (summary?.rollingSummary?.trim()) {
    return summary.rollingSummary.trim();
  }

  const preview = session.searchableTextPreview.trim();
  if (preview) {
    return preview;
  }

  if (session.turnCount === 0) {
    return "Start listening and a summary will appear here.";
  }

  return "Summary will appear as this session continues.";
}

export function getSessionPreviewLine(session: SessionDoc): string | null {
  const preview = session.searchableTextPreview.trim();
  if (!preview) return null;
  const line = preview.replace(/\s+/g, " ");
  return line.length > 72 ? `${line.slice(0, 72)}…` : line;
}
