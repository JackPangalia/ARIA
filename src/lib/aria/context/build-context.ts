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
 * The recent window becomes one chronological conversation: room speech,
 * questions put to Kivo, and Kivo's own answers, in the order they happened.
 * Consecutive human turns fold into a single user message so the alternation
 * the API expects survives.
 *
 * Q/A used to become chat turns while room speech went to a trailing blob
 * labeled "not what you are being asked about". That split destroyed the
 * ordering — the model could not tell what was said a second ago from what was
 * said ten turns back, so "what did I just say" and "go on" reached for the
 * wrong exchange, and anything Kivo heard but didn't answer was effectively
 * invisible. Keeping one ordered list is what a chat client does, and it is the
 * only representation where recency is legible.
 */
export function buildHistoryTurns(turns: TurnDoc[]): ContextHistoryTurn[] {
  const history: ContextHistoryTurn[] = [];

  for (const turn of turns) {
    if (turn.role === "assistant") {
      history.push({
        role: "assistant",
        text: turn.interrupted
          ? `${heardTurnText(turn)}\n\n[The user cut this answer off here.]`
          : turn.text,
      });
      continue;
    }

    // Multi-party sessions keep the speaker's name inline so answers to
    // different people stay attributable.
    const line = turn.speakerName
      ? `${turn.speakerName}: ${turn.text}`
      : turn.text;
    const previous = history[history.length - 1];
    if (previous && previous.role === "user") {
      previous.text = `${previous.text}\n${line}`;
      continue;
    }
    history.push({ role: "user", text: line });
  }

  return history;
}

export function buildSessionHeader(session: SessionDoc): string {
  return [
    `# Session`,
    `Title: ${session.title}`,
    session.projectId ? `Project ID: ${session.projectId}` : null,
    `Status: ${session.status}`,
    `Speakers expected: ${session.speakerCount}`,
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

const CURRENT_QUESTION_LOOKBACK = 3;

function dropCurrentQuestionCopy(turns: TurnDoc[], question: string): TurnDoc[] {
  const start = Math.max(0, turns.length - CURRENT_QUESTION_LOOKBACK);
  for (let index = turns.length - 1; index >= start; index--) {
    const turn = turns[index];
    if (turn.role !== "user_question") continue;
    if (sanitizeQuestionText(turn.text) !== question) continue;
    return [...turns.slice(0, index), ...turns.slice(index + 1)];
  }
  return turns;
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
  //
  // Room speech can be persisted after the question, so the copy is not always
  // the last turn. Scan back a few, but no further: repeating yourself in a
  // long session is legitimate history and shouldn't be erased.
  const withoutCurrentQuestion = dropCurrentQuestionCopy(
    recentTurnsRaw,
    question
  );

  const recentTurns = dedupeAdjacentContextTurns(withoutCurrentQuestion);

  // Everything recent — room speech included — becomes ordered chat history.
  // Nothing about the live conversation is left in a side blob.
  const history = buildHistoryTurns(recentTurns);

  const recentIds = new Set(recentTurns.map((turn) => turn.id));
  const supplementalHits = searchHits.filter((turn) => !recentIds.has(turn.id));

  const projectSection = buildProjectKnowledgeSection({
    project,
    sources: projectSources,
  });

  const pinnedFacts = facts.filter((fact) => fact.pinned);
  const generatedFacts = facts.filter((fact) => !fact.pinned).slice(0, 20);

  const stableSections: string[] = [
    projectSection,
    buildSessionHeader(input.session),
  ].filter((section): section is string => Boolean(section));

  if (rollingSummary) {
    stableSections.push(`# Rolling summary\n\n${rollingSummary}`);
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
    stableSections.push(`# Final meeting summary\n\n${sections.join("\n\n")}`);
  }

  if (summary && summary.keyDecisions.length > 0) {
    stableSections.push(
      `# Key decisions\n\n${summary.keyDecisions.map((item) => `- ${item}`).join("\n")}`
    );
  }

  if (summary && summary.openQuestions.length > 0) {
    stableSections.push(
      `# Open questions\n\n${summary.openQuestions.map((item) => `- ${item}`).join("\n")}`
    );
  }

  if (pinnedFacts.length > 0 || generatedFacts.length > 0) {
    const lines = [
      ...pinnedFacts.map((fact) => `- [pinned ${fact.category}] ${fact.text}`),
      ...generatedFacts.map((fact) => `- [${fact.category}] ${fact.text}`),
    ];
    stableSections.push(`# Key facts\n\n${lines.join("\n")}`);
  }

  if (pins.length > 0) {
    stableSections.push(
      `# Pinned snippets\n\n${pins
        .map((pin) => `- ${pin.label}: ${pin.snippet}`)
        .join("\n")}`
    );
  }

  // The only thing left outside the conversation is the keyword lookup into
  // parts of the session that have already fallen out of the recent window.
  // It is explicitly older than the conversation so the model stops treating a
  // stray keyword match as the current topic.
  const liveSections: string[] = [];

  if (supplementalHits.length > 0) {
    liveSections.push(
      `# Archive lookup\n\nOlder lines from earlier in this session, matched on keywords. They are out of order and may be unrelated. The conversation above is what is current; use these only if the question is explicitly about something earlier.\n\n${supplementalHits
        .map((turn) => formatTurnForContext(turn))
        .join("\n")}`
    );
  }

  let historyTurns = history;
  const historyTexts = () => historyTurns.map((turn) => turn.text);
  let stableContext = stableSections.join("\n\n");
  let liveTranscript = liveSections.join("\n\n");
  let messages = [stableContext, liveTranscript].filter(Boolean).join("\n\n");
  let tokenEstimate = estimateTokensForTexts([
    messages,
    ...historyTexts(),
    question,
  ]);
  let budgetTrimApplied = false;

  if (
    estimateTokensForTexts([messages, ...historyTexts(), question]) >
    CONTEXT_BUDGET_TOKENS
  ) {
    // Drop the archive lookup first and keep the tail of the conversation —
    // recency is what answers follow-ups, and the rolling summary already
    // carries whatever fell off the front.
    budgetTrimApplied = true;
    historyTurns = history.slice(-16);
    stableContext = [
      projectSection,
      buildSessionHeader(input.session),
      rollingSummary ? `# Rolling summary\n\n${rollingSummary}` : null,
      meetingSummary
        ? `# Final meeting summary\n\n${meetingSummary.overview}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    liveTranscript = "";
    messages = [stableContext, liveTranscript].filter(Boolean).join("\n\n");
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

  return {
    messages,
    stableContext,
    liveTranscript,
    history: historyTurns,
    tokenEstimate,
    question,
    log,
  };
}

export { shouldCompactSession } from "@/lib/aria/context/turn-selection";
export { speakerLabel };
