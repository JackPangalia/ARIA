const PREFIX = "[ARIA]";

export function isContextDevLoggingEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.ARIA_CONTEXT_DEBUG === "1"
  );
}

export function isVerboseContextLogging(): boolean {
  return process.env.ARIA_CONTEXT_VERBOSE === "1";
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function truncate(text: string, max = 96): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

export type ContextBundleLog = {
  sessionId: string;
  question: string;
  buildMs: number;
  tokens: number;
  promptChars: number;
  summary: boolean;
  summaryChars: number;
  decisions: number;
  openQuestions: number;
  facts: number;
  pins: number;
  project: boolean;
  projectInstructionChars: number;
  searchHits: number;
  searchTerms: string[];
  recentTurns: number;
  historyTurns: number;
  seqFirst: number | null;
  seqLast: number | null;
  budgetTrim: boolean;
};

export type CompactLog = {
  sessionId: string;
  durationMs: number;
  action: "skipped" | "summarized";
  reason?: string;
  eligibleTurns?: number;
  compressedTurns?: number;
  summaryChars?: number;
  decisions?: number;
  facts?: number;
  seqFrom?: number;
  seqTo?: number;
};

export type AskCompleteLog = {
  sessionId: string;
  speaker: string | number | null;
  model: string;
  contextBuildMs: number;
  composioMs: number;
  agentMs: number;
  compactMs: number;
  totalMs: number;
  bundle: ContextBundleLog;
  answerChars: number;
  answerTokens: number;
  compact: CompactLog | null;
};

function shortSessionId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function seqRange(first: number | null, last: number | null): string {
  if (first == null || last == null) return "—";
  return first === last ? `${first}` : `${first}-${last}`;
}

export function logContextBundleReady(bundle: ContextBundleLog): void {
  if (!isContextDevLoggingEnabled()) return;

  const sid = shortSessionId(bundle.sessionId);
  const summary = bundle.summary
    ? `yes (${bundle.summaryChars}c)`
    : "no";
  const search =
    bundle.searchHits > 0
      ? `${bundle.searchHits} hit${bundle.searchHits === 1 ? "" : "s"} [${bundle.searchTerms.slice(0, 4).join(", ")}]`
      : "none";

  console.log(
    `${PREFIX} context │ ${sid} │ build ${formatMs(bundle.buildMs)} │ ~${bundle.tokens} tok │ ${bundle.recentTurns} recent / ${bundle.historyTurns} history (seq ${seqRange(bundle.seqFirst, bundle.seqLast)}) │ search ${search} │ summary ${summary} │ project ${bundle.project ? "yes" : "no"}`
  );
  console.log(`${PREFIX}   Q: ${truncate(bundle.question, 120)}`);

  if (isVerboseContextLogging()) {
    console.log(
      `${PREFIX}   meta: decisions=${bundle.decisions} open=${bundle.openQuestions} facts=${bundle.facts} pins=${bundle.pins} projectInstructions=${bundle.projectInstructionChars}c trim=${bundle.budgetTrim} prompt=${bundle.promptChars}c`
    );
  }
}

export function logCompact(result: CompactLog): void {
  if (!isContextDevLoggingEnabled()) return;

  const sid = shortSessionId(result.sessionId);

  if (result.action === "skipped") {
    console.log(
      `${PREFIX} compact │ ${sid} │ skip ${formatMs(result.durationMs)} │ ${result.reason ?? "below threshold"}`
    );
    return;
  }

  console.log(
    `${PREFIX} compact │ ${sid} │ ${formatMs(result.durationMs)} │ compressed ${result.compressedTurns} turns (seq ${result.seqFrom}-${result.seqTo}) │ summary ${result.summaryChars}c │ +${result.decisions} decisions │ +${result.facts} facts`
  );

  if (isVerboseContextLogging() && result.summaryChars && result.summaryChars > 0) {
    console.log(`${PREFIX}   (set ARIA_CONTEXT_VERBOSE=1 — summary text omitted in default mode)`);
  }
}

export function logAskComplete(report: AskCompleteLog): void {
  if (!isContextDevLoggingEnabled()) return;

  const sid = shortSessionId(report.sessionId);
  const speaker =
    report.speaker == null
      ? "—"
      : typeof report.speaker === "string"
        ? report.speaker
        : `Speaker ${report.speaker + 1}`;

  console.log(
    `${PREFIX} ask done │ ${sid} │ ${speaker} │ ${formatMs(report.totalMs)} total │ context ${formatMs(report.contextBuildMs)} │ composio ${formatMs(report.composioMs)} │ agent ${formatMs(report.agentMs)} │ compact ${formatMs(report.compactMs)}`
  );
  console.log(
    `${PREFIX}   tokens ~${report.bundle.tokens} in │ ~${report.answerTokens} out │ answer ${report.answerChars}c │ model ${report.model}`
  );
  console.log(`${PREFIX}   Q: ${truncate(report.bundle.question, 120)}`);

  if (report.compact) {
    logCompact(report.compact);
  }
}

export function logContextVerboseBlock(title: string, body: string): void {
  if (!isContextDevLoggingEnabled() || !isVerboseContextLogging()) return;
  console.log(`${PREFIX} verbose │ ${title}`);
  console.log(body);
  console.log(`${PREFIX} verbose │ end`);
}

/**
 * Prints the exact, raw prompt handed to Kivo (system instructions + user
 * message). The body is left unprefixed so it can be copied verbatim. Prints
 * by default whenever dev logging is on; set ARIA_PROMPT_DEBUG=0 to silence it
 * if the full dump gets noisy.
 */
export function logRawPrompt(input: {
  system: string;
  user: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  model?: string;
  approxTokens?: number;
}): void {
  if (!isContextDevLoggingEnabled()) return;
  if (process.env.ARIA_PROMPT_DEBUG === "0") return;

  const bar = "━".repeat(64);
  const history = input.history ?? [];
  const meta = [
    input.model ? `model ${input.model}` : null,
    input.approxTokens != null ? `~${input.approxTokens} tok` : null,
    history.length ? `${history.length} history turns` : null,
    `${input.system.length + input.user.length}c`,
  ]
    .filter(Boolean)
    .join(" │ ");

  console.log(`\n${PREFIX} ${bar}`);
  console.log(`${PREFIX} RAW PROMPT → Kivo${meta ? `  (${meta})` : ""}`);
  console.log(`${PREFIX} ${bar}`);
  console.log(`${PREFIX} ───── SYSTEM ─────`);
  console.log(input.system);
  for (const turn of history) {
    console.log(
      `${PREFIX} ───── ${turn.role === "user" ? "HISTORY USER" : "HISTORY KIVO"} ─────`
    );
    console.log(turn.text);
  }
  console.log(`${PREFIX} ───── USER ─────`);
  console.log(input.user);
  console.log(`${PREFIX} ${bar}\n`);
}

/** @deprecated Use structured log helpers instead. */
export function contextDevLog(
  _phase: string,
  _message: string,
  _data?: Record<string, unknown>
): void {
  /* no-op: replaced by logContextBundleReady / logAskComplete / logCompact */
}

/** @deprecated Use logContextVerboseBlock when ARIA_CONTEXT_VERBOSE=1. */
export function contextDevLogBlock(
  _phase: string,
  title: string,
  body: string
): void {
  logContextVerboseBlock(title, body);
}
