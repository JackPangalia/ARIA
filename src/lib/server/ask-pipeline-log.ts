import { formatMs, isContextDevLoggingEnabled, truncate } from "./context-dev-log";

const PREFIX = "[ARIA]";

export type AskPipelineDetail = Record<
  string,
  string | number | boolean | null | undefined
>;

export type AskPipelineHandle = {
  sessionId: string;
  turnId: string | null;
  /** Elapsed ms since ask request began. */
  elapsed: () => number;
  stage: (phase: string, detail?: AskPipelineDetail) => void;
};

function shortSessionId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function formatDetail(detail?: AskPipelineDetail): string {
  if (!detail) return "";
  const parts = Object.entries(detail)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${v}`);
  return parts.length > 0 ? ` │ ${parts.join(" ")}` : "";
}

export function isAskPipelineLoggingEnabled(): boolean {
  return isContextDevLoggingEnabled();
}

export function startAskPipeline(
  sessionId: string,
  question: string,
  turnId: string | null = null
): AskPipelineHandle {
  const t0 = performance.now();
  const sid = shortSessionId(sessionId);

  const handle: AskPipelineHandle = {
    sessionId,
    turnId,
    elapsed: () => performance.now() - t0,
    stage(phase, detail) {
      if (!isAskPipelineLoggingEnabled()) return;
      const offset = formatMs(performance.now() - t0).padStart(6, " ");
      console.log(
        `${PREFIX} ask │ ${sid} │ ${offset} │ ${phase}${formatDetail({
          turnId: turnId ?? undefined,
          ...detail,
        })}`
      );
    },
  };

  if (isAskPipelineLoggingEnabled()) {
    console.log(
      `${PREFIX} ask │ ${sid} │      0ms │ start${turnId ? ` │ turnId=${turnId}` : ""} │ Q: ${truncate(question, 100)}`
    );
  }

  return handle;
}

let activeComposioPipeline: AskPipelineHandle | undefined;

/** Scoped to the current /api/ask request for Composio tool execute timing. */
export function setAskPipelineForComposio(
  pipeline: AskPipelineHandle | undefined
): void {
  activeComposioPipeline = pipeline;
}

export function logComposioToolExecute(slug: string, ms: number): void {
  activeComposioPipeline?.stage("tool.execute", {
    slug,
    ms: Math.round(ms),
  });
}

export function logComposioCache(
  uid: string,
  detail: {
    cache: "hit" | "miss" | "empty" | "skip";
    fetchMs: number;
    toolCount: number;
    toolkitFingerprint: string;
  }
): void {
  if (!isAskPipelineLoggingEnabled()) return;
  const uidShort = uid.length > 10 ? `${uid.slice(0, 8)}…` : uid;
  console.log(
    `${PREFIX} composio │ ${uidShort} │ ${detail.cache} │ ${formatMs(detail.fetchMs)} │ tools=${detail.toolCount}${detail.toolkitFingerprint ? ` │ ${detail.toolkitFingerprint}` : ""}`
  );
}

export type AskTimingReport = {
  sessionId: string;
  speaker: string | number | null;
  model: string;
  question: string;
  totalMs: number;
  authSessionMs: number;
  contextBuildMs: number;
  composioMs: number;
  preLlmMs: number;
  agentReadyMs: number;
  llmFirstTokenMs: number | null;
  llmTextDoneMs: number | null;
  firstTtsEnqueueMs: number | null;
  firstAudioByteMs: number | null;
  streamDoneMs: number;
  persistAssistantMs: number;
  compactMs: number;
  ttsChunkCount: number;
  answerChars: number;
  answerTokens: number;
  composioCache: string;
  composioToolCount: number;
  ttsTransport: string;
  ttsFallbackReason: string | null;
  promptCacheReadTokens?: number | null;
};

export function logAskTimingSummary(report: AskTimingReport): void {
  // One structured line per ask, ALWAYS — this is the production latency/health
  // signal in Vercel logs (filter on "[ask]"). Verbose breakdown stays dev-only.
  console.log(
    "[ask]",
    JSON.stringify({
      sessionId: shortSessionId(report.sessionId),
      model: report.model,
      totalMs: Math.round(report.totalMs),
      llmFirstTokenMs:
        report.llmFirstTokenMs != null ? Math.round(report.llmFirstTokenMs) : null,
      firstAudioByteMs:
        report.firstAudioByteMs != null ? Math.round(report.firstAudioByteMs) : null,
      answerTokens: report.answerTokens,
      composioCache: report.composioCache,
      ttsTransport: report.ttsTransport,
      ttsFallbackReason: report.ttsFallbackReason,
      promptCacheReadTokens: report.promptCacheReadTokens ?? null,
    })
  );

  if (!isAskPipelineLoggingEnabled()) return;

  const sid = shortSessionId(report.sessionId);
  const speaker =
    report.speaker == null
      ? "—"
      : typeof report.speaker === "string"
        ? report.speaker
        : `Speaker ${report.speaker + 1}`;

  console.log(
    `${PREFIX} ask done │ ${sid} │ ${speaker} │ ${formatMs(report.totalMs)} total`
  );
  console.log(
    `${PREFIX}   pre-llm: auth+session ${formatMs(report.authSessionMs)} │ parallel wall ${formatMs(report.preLlmMs)} (context ${formatMs(report.contextBuildMs)} + composio ${formatMs(report.composioMs)} ${report.composioCache} ${report.composioToolCount} tools)`
  );
  console.log(
    `${PREFIX}   agent: ready ${formatMs(report.agentReadyMs)} │ 1st token ${report.llmFirstTokenMs != null ? formatMs(report.llmFirstTokenMs) : "—"} │ text done ${report.llmTextDoneMs != null ? formatMs(report.llmTextDoneMs) : "—"} │ cache read ${report.promptCacheReadTokens != null ? report.promptCacheReadTokens : "—"}`
  );
  console.log(
    `${PREFIX}   audio: 1st tts req ${report.firstTtsEnqueueMs != null ? formatMs(report.firstTtsEnqueueMs) : "—"} │ 1st byte ${report.firstAudioByteMs != null ? formatMs(report.firstAudioByteMs) : "—"} │ stream done ${formatMs(report.streamDoneMs)} │ ${report.ttsChunkCount} tts chunk(s)`
  );
  console.log(
    `${PREFIX}   after: persist ${formatMs(report.persistAssistantMs)} │ compact ${formatMs(report.compactMs)} │ ~${report.answerTokens} tok out │ ${report.answerChars}c │ model ${report.model}`
  );
  console.log(`${PREFIX}   Q: ${truncate(report.question, 120)}`);
}
