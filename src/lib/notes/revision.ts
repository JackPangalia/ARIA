/**
 * Pure decisions behind the notes store, kept out of the Firestore code so the
 * rules (stale saves refused, edits never silently replaced, a wedged
 * generation eventually recoverable) are testable without a database.
 */

import type { EnhancedNotesDoc } from "@/lib/notes/types";

/** A generation flagged this long ago with no result is treated as dead. */
export const GENERATION_STALE_MS = 3 * 60_000;

export type SaveDecision =
  | { kind: "write"; nextRevision: number }
  | { kind: "conflict" };

export function decideSave(
  currentRevision: number,
  baseRevision: number
): SaveDecision {
  if (baseRevision !== currentRevision) return { kind: "conflict" };
  return { kind: "write", nextRevision: currentRevision + 1 };
}

export type GenerateDecision =
  | { kind: "start" }
  | { kind: "busy" }
  | { kind: "edited" };

export function decideGenerate(
  current: EnhancedNotesDoc,
  input: { force: boolean; now: number }
): GenerateDecision {
  if (current.status === "generating") {
    const startedAt = current.updatedAt ? Date.parse(current.updatedAt) : NaN;
    const stale =
      !Number.isFinite(startedAt) || input.now - startedAt > GENERATION_STALE_MS;
    if (!stale) return { kind: "busy" };
  }
  if (current.editedAt && !input.force) return { kind: "edited" };
  return { kind: "start" };
}

/**
 * When a generation finishes, the doc may have been edited by hand while the
 * model was writing. Those edits win: the result is discarded and the doc is
 * simply marked ready again.
 */
export function generationResultSupersededByEdit(
  current: EnhancedNotesDoc,
  generationStartedAtIso: string
): boolean {
  if (!current.editedAt) return false;
  return Date.parse(current.editedAt) > Date.parse(generationStartedAtIso);
}
