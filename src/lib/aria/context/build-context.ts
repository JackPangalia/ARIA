import { estimateTokensForTexts } from "@/lib/aria/context/token-estimate";
import {
  extractSearchTerms,
  hasEarlySessionSearchIntent,
  sanitizeQuestionText,
} from "@/lib/aria/context/question-text";
import { dedupeAdjacentContextTurns } from "@/lib/aria/context/turn-selection";
import {
  logContextBundleReady,
  logContextVerboseBlock,
  type ContextBundleLog,
} from "@/lib/server/context-dev-log";
import {
  CONTEXT_BUDGET_TOKENS,
  MAX_SEARCH_HITS,
  RECENT_TURN_COUNT,
} from "@/lib/sessions/constants";
import {
  formatTurnForContext,
  getRecentContextTurns,
  getSummary,
  listFacts,
  listPins,
  searchContextTurns,
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
}): Promise<ContextBundle & { log: ContextBundleLog }> {
  const buildStart = performance.now();
  const question = sanitizeQuestionText(input.question);

  const [summary, facts, pins, recentTurnsRaw] = await Promise.all([
    getSummary(input.uid, input.session.id),
    listFacts(input.uid, input.session.id),
    listPins(input.uid, input.session.id),
    getRecentContextTurns(input.uid, input.session.id, RECENT_TURN_COUNT),
  ]);

  const recentTurns = dedupeAdjacentContextTurns(recentTurnsRaw);

  const searchHits = await searchContextTurns(
    input.uid,
    input.session.id,
    question,
    MAX_SEARCH_HITS,
    {
      preferEarlySession: hasEarlySessionSearchIntent(question),
      excludeTurnIds: new Set(recentTurns.map((turn) => turn.id)),
    }
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
  let tokenEstimate = estimateTokensForTexts([messages, question]);
  let budgetTrimApplied = false;

  if (tokenEstimate > CONTEXT_BUDGET_TOKENS) {
    budgetTrimApplied = true;
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
    tokenEstimate = estimateTokensForTexts([messages, question]);
  }

  const buildMs = performance.now() - buildStart;
  const searchTerms = extractSearchTerms(question);

  const log: ContextBundleLog = {
    sessionId: input.session.id,
    question,
    buildMs,
    tokens: tokenEstimate,
    promptChars: messages.length + question.length + 32,
    summary: Boolean(summary?.rollingSummary),
    summaryChars: summary?.rollingSummary?.length ?? 0,
    decisions: summary?.keyDecisions?.length ?? 0,
    openQuestions: summary?.openQuestions?.length ?? 0,
    facts: pinnedFacts.length + generatedFacts.length,
    pins: pins.length,
    searchHits: supplementalHits.length,
    searchTerms,
    recentTurns: recentTurns.length,
    seqFirst: recentTurns[0]?.sequence ?? null,
    seqLast: recentTurns[recentTurns.length - 1]?.sequence ?? null,
    budgetTrim: budgetTrimApplied,
  };

  logContextBundleReady(log);

  if (summary?.rollingSummary) {
    logContextVerboseBlock("rolling summary", summary.rollingSummary);
  }
  logContextVerboseBlock("messages block", messages);

  return { messages, tokenEstimate, question, log };
}

export { shouldCompactSession } from "@/lib/aria/context/turn-selection";
export { speakerLabel };
