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
  getRecentContextTurns,
  getSummary,
  listFacts,
  listPins,
  searchContextTurns,
} from "@/lib/sessions/repository";
import type {
  ProjectDoc,
  ProjectSourceDoc,
} from "@/lib/projects/types";
import type { ContextBundle, SessionDoc } from "@/lib/sessions/types";

const PROJECT_CONTEXT_TOKEN_BUDGET = 1600;

function speakerLabel(id: number | null): string {
  return id == null ? "Speaker" : `Speaker ${id + 1}`;
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
}): Promise<ContextBundle & { log: ContextBundleLog }> {
  const buildStart = performance.now();
  const question = sanitizeQuestionText(input.question);

  const projectId = input.session.projectId;
  const [project, projectSources, summary, facts, pins, recentTurnsRaw] = await Promise.all([
    input.session.projectId ? getProject(input.uid, input.session.projectId) : null,
    projectId
      ? listSourcesForContext(input.uid, projectId).catch(() => [])
      : Promise.resolve([]),
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

  const projectSection = buildProjectKnowledgeSection({
    project,
    sources: projectSources,
  });
  const dynamicSections: string[] = [buildSessionHeader(input.session)];

  if (summary?.rollingSummary) {
    dynamicSections.push(`# Rolling summary\n\n${summary.rollingSummary}`);
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

  if (recentTurns.length > 0) {
    dynamicSections.push(
      `# Recent turns\n\n${recentTurns
        .map((turn) => formatTurnForContext(turn))
        .join("\n")}`
    );
  }

  let dynamicMessages = dynamicSections.join("\n\n");
  let messages = [projectSection, dynamicMessages].filter(Boolean).join("\n\n");
  let tokenEstimate = estimateTokensForTexts([messages, question]);
  let budgetTrimApplied = false;

  if (estimateTokensForTexts([dynamicMessages, question]) > CONTEXT_BUDGET_TOKENS) {
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

    dynamicMessages = compactSections.join("\n\n");
    messages = [projectSection, dynamicMessages].filter(Boolean).join("\n\n");
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
    project: Boolean(projectSection),
    projectInstructionChars: project?.instructions?.trim().length ?? 0,
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
  if (projectSection) {
    logContextVerboseBlock("project context", projectSection);
  }
  // Full context is now printed verbatim by logRawPrompt() at agent run time,
  // so we no longer duplicate the assembled messages block here.

  return { messages, tokenEstimate, question, log };
}

export { shouldCompactSession } from "@/lib/aria/context/turn-selection";
export { speakerLabel };
