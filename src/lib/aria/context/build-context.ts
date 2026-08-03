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
  CHARS_PER_TOKEN,
  MAX_SEARCH_HITS,
  RECENT_TURN_COUNT,
} from "@/lib/sessions/constants";
import { getProject } from "@/lib/projects/repository";
import { listSourcesForContext } from "@/lib/projects/sources-repository";
import {
  formatTurnForContext,
  getMeetingSummary,
  getRecentContextTurns,
  getSummary,
  heardTurnText,
  listFacts,
  listPins,
  searchContextTurns,
} from "@/lib/sessions/repository";
import type {
  ProjectDoc,
  ProjectSourceDoc,
} from "@/lib/projects/types";
import type {
  ContextBundle,
  ContextHistoryTurn,
  SessionDoc,
  TurnDoc,
} from "@/lib/sessions/types";

const PROJECT_CONTEXT_TOKEN_BUDGET = 1600;

function speakerLabel(id: number | null): string {
  return id == null ? "Speaker" : `Speaker ${id + 1}`;
}

/**
 * Prior Q/A exchanges become real chat turns instead of transcript lines —
 * the model tracks a conversation it actually had, not one it reads about.
 * Multi-party sessions keep the asker's name inside the user turn so answers
 * to different people stay attributable.
 */
export function buildHistoryTurns(turns: TurnDoc[]): ContextHistoryTurn[] {
  return turns
    .filter((turn) => turn.role === "user_question" || turn.role === "assistant")
    .map((turn) =>
      turn.role === "assistant"
        ? {
            role: "assistant" as const,
            text: turn.interrupted
              ? `${heardTurnText(turn)}\n\n[The user cut this answer off here.]`
              : turn.text,
          }
        : {
            role: "user" as const,
            text: turn.speakerName
              ? `${turn.speakerName}: ${turn.text}`
              : turn.text,
          }
    );
}

function buildSessionHeader(session: SessionDoc): string {
  return [
    `# Session`,
    `Title: ${session.title}`,
    session.projectId ? `Project ID: ${session.projectId}` : null,
    `Status: ${session.status}`,
    `Speakers expected: ${session.speakerCount}`,
    `Updated: ${session.updatedAt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function trimProjectInstructionsForContext(
  instructions: string,
  tokenBudget = PROJECT_CONTEXT_TOKEN_BUDGET
): string {
  const trimmed = instructions.trim();
  if (!trimmed) return "";
  const maxChars = tokenBudget * CHARS_PER_TOKEN;
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 24)).trimEnd()}\n[Project instructions truncated]`;
}

export function buildProjectContextSection(project: ProjectDoc | null): string | null {
  if (!project || project.status !== "active") return null;
  const instructions = trimProjectInstructionsForContext(project.instructions);
  const lines = [`# Project`, `Name: ${project.name}`];
  if (instructions) {
    lines.push("", `Instructions/context:`, instructions);
  }
  return lines.join("\n");
}

function buildProjectSourcesSection(sources: ProjectSourceDoc[]): string | null {
  if (sources.length === 0) return null;
  return [
    "# Project sources",
    "",
    ...sources.map((source) =>
      [
        `## ${source.name}`,
        `Type: ${source.kind}`,
        "",
        source.text,
      ].join("\n")
    ),
  ].join("\n\n");
}

export function buildProjectKnowledgeSection(input: {
  project: ProjectDoc | null;
  sources: ProjectSourceDoc[];
}): string | null {
  const sections = [
    buildProjectContextSection(input.project),
    buildProjectSourcesSection(input.sources),
  ].filter(Boolean);
  return sections.length > 0 ? sections.join("\n\n") : null;
}

export async function buildContextBundle(input: {
  uid: string;
  session: SessionDoc;
  question: string;
  /** Include the final human-readable recap only for post-meeting written chat. */
  includeMeetingSummary?: boolean;
}): Promise<ContextBundle & { log: ContextBundleLog }> {
  const buildStart = performance.now();
  const question = sanitizeQuestionText(input.question);

  const projectId = input.session.projectId;
  const [
    project,
    projectSources,
    summary,
    meetingSummary,
    facts,
    pins,
    recentTurnsRaw,
    searchHits,
  ] = await Promise.all([
    input.session.projectId
      ? getProject(input.uid, input.session.projectId)
      : null,
    projectId
      ? listSourcesForContext(input.uid, projectId).catch(() => [])
      : Promise.resolve([]),
    getSummary(input.uid, input.session.id),
    input.includeMeetingSummary && input.session.status === "ended"
      ? getMeetingSummary(input.uid, input.session.id)
      : Promise.resolve(null),
    listFacts(input.uid, input.session.id),
    listPins(input.uid, input.session.id),
    getRecentContextTurns(input.uid, input.session.id, RECENT_TURN_COUNT),
    searchContextTurns(
      input.uid,
      input.session.id,
      question,
      MAX_SEARCH_HITS,
      { preferEarlySession: hasEarlySessionSearchIntent(question) }
    ),
  ]);
  const rollingSummary = meetingSummary ? null : summary?.rollingSummary;

  // The ask pipeline persists the current question fire-and-forget while this
  // context build runs, so the question may or may not already be in the
  // recent-turn window. It's passed separately as the live question — a copy
  // here would make the model see it twice.
  const withoutCurrentQuestion =
    recentTurnsRaw.length > 0 &&
    recentTurnsRaw[recentTurnsRaw.length - 1].role === "user_question" &&
    sanitizeQuestionText(recentTurnsRaw[recentTurnsRaw.length - 1].text) ===
      question
      ? recentTurnsRaw.slice(0, -1)
      : recentTurnsRaw;

  const recentTurns = dedupeAdjacentContextTurns(withoutCurrentQuestion);

  // Q/A exchanges leave the transcript blob and become real chat history;
  // only ambient room speech stays as reference text.
  const history = buildHistoryTurns(recentTurns);
  const roomTurns = recentTurns.filter((turn) => turn.role === "speaker");

  const recentIds = new Set(recentTurns.map((turn) => turn.id));
  const supplementalHits = searchHits.filter((turn) => !recentIds.has(turn.id));

  const projectSection = buildProjectKnowledgeSection({
    project,
    sources: projectSources,
  });
  const dynamicSections: string[] = [buildSessionHeader(input.session)];

  if (rollingSummary) {
    dynamicSections.push(`# Rolling summary\n\n${rollingSummary}`);
  }

  if (meetingSummary) {
    const sections = [
      meetingSummary.overview,
      meetingSummary.decisions.length > 0
        ? `Decisions:\n${meetingSummary.decisions.map((item) => `- ${item}`).join("\n")}`
        : null,
      meetingSummary.keyPoints.length > 0
        ? `Key points:\n${meetingSummary.keyPoints.map((item) => `- ${item}`).join("\n")}`
        : null,
      meetingSummary.actionItems.length > 0
        ? `Action items:\n${meetingSummary.actionItems.map((item) => `- ${item}`).join("\n")}`
        : null,
    ].filter(Boolean);
    dynamicSections.push(`# Final meeting summary\n\n${sections.join("\n\n")}`);
  }

  if (summary && summary.keyDecisions.length > 0) {
    dynamicSections.push(
      `# Key decisions\n\n${summary.keyDecisions.map((item) => `- ${item}`).join("\n")}`
    );
  }

  if (summary && summary.openQuestions.length > 0) {
    dynamicSections.push(
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
    dynamicSections.push(`# Key facts\n\n${lines.join("\n")}`);
  }

  if (pins.length > 0) {
    dynamicSections.push(
      `# Pinned snippets\n\n${pins
        .map((pin) => `- ${pin.label}: ${pin.snippet}`)
        .join("\n")}`
    );
  }

  if (supplementalHits.length > 0) {
    dynamicSections.push(
      `# Relevant earlier context\n\n${supplementalHits
        .map((turn) => formatTurnForContext(turn))
        .join("\n")}`
    );
  }

  if (roomTurns.length > 0) {
    dynamicSections.push(
      `# Recent room transcript\n\n${roomTurns
        .map((turn) => formatTurnForContext(turn))
        .join("\n")}`
    );
  }

  let historyTurns = history;
  const historyTexts = () => historyTurns.map((turn) => turn.text);
  let dynamicMessages = dynamicSections.join("\n\n");
  let messages = [projectSection, dynamicMessages].filter(Boolean).join("\n\n");
  let tokenEstimate = estimateTokensForTexts([
    messages,
    ...historyTexts(),
    question,
  ]);
  let budgetTrimApplied = false;

  if (
    estimateTokensForTexts([dynamicMessages, ...historyTexts(), question]) >
    CONTEXT_BUDGET_TOKENS
  ) {
    budgetTrimApplied = true;
    historyTurns = history.slice(-12);
    const trimmedRoom = roomTurns.slice(-10);
    const compactSections = [
      buildSessionHeader(input.session),
      rollingSummary
        ? `# Rolling summary\n\n${rollingSummary}`
        : null,
      meetingSummary
        ? `# Final meeting summary\n\n${meetingSummary.overview}`
        : null,
      trimmedRoom.length
        ? `# Recent room transcript\n\n${trimmedRoom
            .map((turn) => formatTurnForContext(turn))
            .join("\n")}`
        : null,
    ].filter(Boolean);

    dynamicMessages = compactSections.join("\n\n");
    messages = [projectSection, dynamicMessages].filter(Boolean).join("\n\n");
    tokenEstimate = estimateTokensForTexts([
      messages,
      ...historyTexts(),
      question,
    ]);
  }

  const buildMs = performance.now() - buildStart;
  const searchTerms = extractSearchTerms(question);

  const log: ContextBundleLog = {
    sessionId: input.session.id,
    question,
    buildMs,
    tokens: tokenEstimate,
    promptChars: messages.length + question.length + 32,
    summary: Boolean(rollingSummary),
    summaryChars: rollingSummary?.length ?? 0,
    decisions: summary?.keyDecisions?.length ?? 0,
    openQuestions: summary?.openQuestions?.length ?? 0,
    facts: pinnedFacts.length + generatedFacts.length,
    pins: pins.length,
    project: Boolean(projectSection),
    projectInstructionChars: project?.instructions?.trim().length ?? 0,
    searchHits: supplementalHits.length,
    searchTerms,
    recentTurns: recentTurns.length,
    historyTurns: historyTurns.length,
    seqFirst: recentTurns[0]?.sequence ?? null,
    seqLast: recentTurns[recentTurns.length - 1]?.sequence ?? null,
    budgetTrim: budgetTrimApplied,
  };

  logContextBundleReady(log);

  if (rollingSummary) {
    logContextVerboseBlock("rolling summary", rollingSummary);
  }
  if (projectSection) {
    logContextVerboseBlock("project context", projectSection);
  }
  // Full context is now printed verbatim by logRawPrompt() at agent run time,
  // so we no longer duplicate the assembled messages block here.

  return { messages, history: historyTurns, tokenEstimate, question, log };
}

export { shouldCompactSession } from "@/lib/aria/context/turn-selection";
export { speakerLabel };
