import { estimateTokensForTexts } from "@/lib/aria/context/token-estimate";
import {
  COMPACTION_THRESHOLD_TOKENS,
  CONTEXT_BUDGET_TOKENS,
  MAX_SEARCH_HITS,
  RECENT_TURN_COUNT,
} from "@/lib/sessions/constants";
import {
  formatTurnForContext,
  getRecentTurns,
  getSummary,
  listFacts,
  listPins,
  searchTurnsInSession,
} from "@/lib/sessions/repository";
import type { ContextBundle, SessionDoc } from "@/lib/sessions/types";

function speakerLabel(id: number | null): string {
  return id == null ? "Speaker" : `Speaker ${id + 1}`;
}

function buildSessionHeader(session: SessionDoc): string {
  return [
    `# Session`,
    `Title: ${session.title}`,
    `Status: ${session.status}`,
    `Speakers expected: ${session.speakerCount}`,
    `Updated: ${session.updatedAt}`,
  ].join("\n");
}

export async function buildContextBundle(input: {
  uid: string;
  session: SessionDoc;
  question: string;
}): Promise<ContextBundle> {
  const [summary, facts, pins, recentTurns] = await Promise.all([
    getSummary(input.uid, input.session.id),
    listFacts(input.uid, input.session.id),
    listPins(input.uid, input.session.id),
    getRecentTurns(input.uid, input.session.id, RECENT_TURN_COUNT),
  ]);

  const searchHits = await searchTurnsInSession(
    input.uid,
    input.session.id,
    input.question,
    MAX_SEARCH_HITS
  );

  const recentIds = new Set(recentTurns.map((turn) => turn.id));
  const supplementalHits = searchHits.filter((turn) => !recentIds.has(turn.id));

  const sections: string[] = [buildSessionHeader(input.session)];

  if (summary?.rollingSummary) {
    sections.push(`# Rolling summary\n\n${summary.rollingSummary}`);
  }

  if (summary && summary.keyDecisions.length > 0) {
    sections.push(
      `# Key decisions\n\n${summary.keyDecisions.map((item) => `- ${item}`).join("\n")}`
    );
  }

  if (summary && summary.openQuestions.length > 0) {
    sections.push(
      `# Open questions\n\n${summary.openQuestions.map((item) => `- ${item}`).join("\n")}`
    );
  }

  const pinnedFacts = facts.filter((fact) => fact.pinned);
  const generatedFacts = facts.filter((fact) => !fact.pinned).slice(0, 20);

  if (pinnedFacts.length > 0 || generatedFacts.length > 0) {
    const lines = [
      ...pinnedFacts.map((fact) => `- [pinned ${fact.category}] ${fact.text}`),
      ...generatedFacts.map((fact) => `- [${fact.category}] ${fact.text}`),
    ];
    sections.push(`# Key facts\n\n${lines.join("\n")}`);
  }

  if (pins.length > 0) {
    sections.push(
      `# Pinned snippets\n\n${pins
        .map((pin) => `- ${pin.label}: ${pin.snippet}`)
        .join("\n")}`
    );
  }

  if (supplementalHits.length > 0) {
    sections.push(
      `# Relevant earlier context\n\n${supplementalHits
        .map((turn) => formatTurnForContext(turn))
        .join("\n")}`
    );
  }

  if (recentTurns.length > 0) {
    sections.push(
      `# Recent turns\n\n${recentTurns
        .map((turn) => formatTurnForContext(turn))
        .join("\n")}`
    );
  }

  let messages = sections.join("\n\n");
  let tokenEstimate = estimateTokensForTexts([messages, input.question]);

  if (tokenEstimate > CONTEXT_BUDGET_TOKENS) {
    const trimmedRecent = recentTurns.slice(-10);
    const compactSections = [
      buildSessionHeader(input.session),
      summary?.rollingSummary
        ? `# Rolling summary\n\n${summary.rollingSummary}`
        : null,
      trimmedRecent.length
        ? `# Recent turns\n\n${trimmedRecent
            .map((turn) => formatTurnForContext(turn))
            .join("\n")}`
        : null,
    ].filter(Boolean);

    messages = compactSections.join("\n\n");
    tokenEstimate = estimateTokensForTexts([messages, input.question]);
  }

  return { messages, tokenEstimate };
}

export function shouldCompactSession(
  unsummarizedTurns: Array<{ tokenEstimate: number }>
): boolean {
  const total = unsummarizedTurns.reduce(
    (sum, turn) => sum + turn.tokenEstimate,
    0
  );
  return total >= COMPACTION_THRESHOLD_TOKENS;
}

export { speakerLabel };
