import {
  COMPACTION_THRESHOLD_TOKENS,
  RECENT_TURN_COUNT,
} from "@/lib/sessions/constants";
import type { TurnDoc, TurnRole } from "@/lib/sessions/types";

const CONTEXT_ELIGIBLE_ROLES = new Set<TurnRole>(["speaker", "assistant"]);

export function isContextEligibleTurn(role: TurnRole): boolean {
  return CONTEXT_ELIGIBLE_ROLES.has(role);
}

export function filterContextEligibleTurns(turns: TurnDoc[]): TurnDoc[] {
  return turns.filter((turn) => isContextEligibleTurn(turn.role));
}

export function shouldCompactSession(unsummarized: TurnDoc[]): boolean {
  const eligible = filterContextEligibleTurns(unsummarized);
  const totalTokens = eligible.reduce(
    (sum, turn) => sum + turn.tokenEstimate,
    0
  );
  return (
    eligible.length > RECENT_TURN_COUNT ||
    totalTokens >= COMPACTION_THRESHOLD_TOKENS
  );
}

function normalizeTurnText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Collapse back-to-back duplicate speaker lines in the prompt only. */
export function dedupeAdjacentContextTurns(turns: TurnDoc[]): TurnDoc[] {
  const out: TurnDoc[] = [];
  for (const turn of turns) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.role === turn.role &&
      prev.role === "speaker" &&
      turn.role === "speaker" &&
      (prev.speakerName ?? prev.speaker) === (turn.speakerName ?? turn.speaker) &&
      normalizeTurnText(prev.text) === normalizeTurnText(turn.text)
    ) {
      continue;
    }
    out.push(turn);
  }
  return out;
}
