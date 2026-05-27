import {
  formatTurnForContext,
  getSummary,
  getUnsummarizedTurns,
  listFacts,
  markTurnsSummarized,
  upsertFacts,
  upsertSummary,
} from "@/lib/sessions/repository";
import {
  filterContextEligibleTurns,
  shouldCompactSession,
} from "@/lib/aria/context/turn-selection";
import {
  COMPACTION_THRESHOLD_TOKENS,
  RECENT_TURN_COUNT,
} from "@/lib/sessions/constants";
import {
  logContextVerboseBlock,
  type CompactLog,
} from "@/lib/server/context-dev-log";
import type { SessionFactDoc } from "@/lib/sessions/types";
import {
  getOpenAI,
  parseSummaryResponse,
  SUMMARY_MODEL,
} from "@/lib/aria/context/openai-client";

type SummarizeResult = {
  summarizedTurnCount: number;
  summaryChars: number;
  keyDecisions: number;
  factsWritten: number;
  seqFrom: number;
  seqTo: number;
  rollingSummary: string;
};

export async function summarizeSession(
  uid: string,
  sessionId: string
): Promise<SummarizeResult | null> {
  const allUnsummarized = await getUnsummarizedTurns(uid, sessionId);
  const unsummarized = filterContextEligibleTurns(allUnsummarized);
  if (unsummarized.length <= RECENT_TURN_COUNT) {
    return null;
  }

  const toSummarize = unsummarized.slice(0, -RECENT_TURN_COUNT);
  if (toSummarize.length === 0) {
    return null;
  }

  const existingSummary = await getSummary(uid, sessionId);
  const existingFacts = await listFacts(uid, sessionId);

  const transcript = toSummarize
    .map((turn) => formatTurnForContext(turn))
    .join("\n");

  const openai = getOpenAI(process.env.OPENAI_API_KEY ?? "");
  const completion = await openai.chat.completions.create({
    model: SUMMARY_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You compress live meeting transcripts for a voice assistant named ARIA.
Return strict JSON with keys:
- rollingSummary: dense paragraph preserving names, decisions, disagreements, tasks, and speaker intent
- keyDecisions: string array
- openQuestions: string array
- timeline: short chronological bullet strings
- facts: array of { text, category } where category is one of fact, preference, decision, todo, name

Preserve unresolved questions and speaker-specific preferences. Do not invent facts.`,
      },
      {
        role: "user",
        content: [
          existingSummary?.rollingSummary
            ? `# Existing summary\n${existingSummary.rollingSummary}`
            : "",
          existingFacts.length
            ? `# Existing facts\n${existingFacts
                .slice(0, 30)
                .map((fact) => `- ${fact.text}`)
                .join("\n")}`
            : "",
          `# New turns to compress\n${transcript}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = parseSummaryResponse(raw);
  const lastCoveredTurnId = toSummarize[toSummarize.length - 1]?.id ?? null;

  await upsertSummary(uid, sessionId, {
    rollingSummary: parsed.rollingSummary,
    keyDecisions: parsed.keyDecisions,
    openQuestions: parsed.openQuestions,
    timeline: parsed.timeline,
    lastCoveredTurnId,
  });

  if (parsed.facts.length > 0) {
    await upsertFacts(
      uid,
      sessionId,
      parsed.facts.map((fact) => ({
        text: fact.text,
        category: fact.category as SessionFactDoc["category"],
        sourceTurnId: lastCoveredTurnId,
      }))
    );
  }

  await markTurnsSummarized(
    uid,
    sessionId,
    toSummarize.map((turn) => turn.id)
  );

  logContextVerboseBlock("new rolling summary", parsed.rollingSummary);

  return {
    summarizedTurnCount: toSummarize.length,
    summaryChars: parsed.rollingSummary.length,
    keyDecisions: parsed.keyDecisions.length,
    factsWritten: parsed.facts.length,
    seqFrom: toSummarize[0]?.sequence ?? 0,
    seqTo: toSummarize[toSummarize.length - 1]?.sequence ?? 0,
    rollingSummary: parsed.rollingSummary,
  };
}

export async function maybeCompactSession(
  uid: string,
  sessionId: string
): Promise<CompactLog> {
  const start = performance.now();
  const unsummarized = await getUnsummarizedTurns(uid, sessionId);

  if (!shouldCompactSession(unsummarized)) {
    const eligible = filterContextEligibleTurns(unsummarized);
    const totalTokens = eligible.reduce(
      (sum, turn) => sum + turn.tokenEstimate,
      0
    );
    return {
      sessionId,
      durationMs: performance.now() - start,
      action: "skipped",
      reason: `${eligible.length} eligible turns, ${totalTokens} tok (need >${RECENT_TURN_COUNT} turns or ≥${COMPACTION_THRESHOLD_TOKENS} tok)`,
      eligibleTurns: eligible.length,
    };
  }

  const result = await summarizeSession(uid, sessionId);
  const durationMs = performance.now() - start;

  if (!result) {
    return {
      sessionId,
      durationMs,
      action: "skipped",
      reason: "nothing to compress after eligibility filter",
    };
  }

  return {
    sessionId,
    durationMs,
    action: "summarized",
    compressedTurns: result.summarizedTurnCount,
    summaryChars: result.summaryChars,
    decisions: result.keyDecisions,
    facts: result.factsWritten,
    seqFrom: result.seqFrom,
    seqTo: result.seqTo,
  };
}
