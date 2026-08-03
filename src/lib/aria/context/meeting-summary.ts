import {
  assertSessionOwner,
  formatTurnForContext,
  listTurns,
  upsertMeetingSummary,
} from "@/lib/sessions/repository";
import { llmGenerateMeetingSummary } from "@/lib/aria/llm/anthropic-client";
import { KIVO_MODEL_ID } from "@/lib/aria/models";
import type { MeetingSummaryDoc } from "@/lib/sessions/types";

/** Below this many substantive (speaker/question) turns, a summary would just
 * restate the whole transcript — not worth the model call. */
const MIN_SUBSTANTIVE_TURNS = 3;

/**
 * Generates the human-readable meeting summary shown in the Overview tab.
 * Runs once, right when a session stops, over the full transcript. Distinct
 * from `summarizeSession`, which incrementally compacts old turns into a
 * rolling summary written for the AI's own context window.
 */
export async function generateMeetingSummary(
  uid: string,
  sessionId: string
): Promise<MeetingSummaryDoc | null> {
  await assertSessionOwner(uid, sessionId);

  const turns = await listTurns(uid, sessionId, 2000);
  const substantiveCount = turns.filter(
    (turn) => turn.role === "speaker" || turn.role === "user_question"
  ).length;
  if (substantiveCount < MIN_SUBSTANTIVE_TURNS) {
    return null;
  }

  const transcript = turns.map((turn) => formatTurnForContext(turn)).join("\n");

  const parsed = await llmGenerateMeetingSummary({
    model: KIVO_MODEL_ID,
    system: `You write clean, human-readable meeting summaries for someone who did not attend but needs to catch up fast.

Return structured output with:
- overview: a dense 2-4 sentence paragraph describing what the conversation was about and how it unfolded
- keyPoints: notable topics or points raised, as short standalone bullet strings
- decisions: concrete decisions that were made (empty array if none were made)
- actionItems: follow-ups, tasks, or commitments mentioned (empty array if none)

Write in plain, natural language, not meeting-minutes jargon. Do not invent information that isn't in the transcript. Do not include speaker labels or timestamps in the output text.`,
    user: `# Full transcript\n${transcript}`,
  });

  return upsertMeetingSummary(uid, sessionId, {
    overview: parsed.overview,
    keyPoints: parsed.keyPoints,
    decisions: parsed.decisions,
    actionItems: parsed.actionItems,
    turnCountAtGeneration: turns.length,
  });
}
