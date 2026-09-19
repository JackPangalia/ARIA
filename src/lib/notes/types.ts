import { z } from "zod";
import { MAX_NOTES_HTML_CHARS } from "@/lib/notes/sanitize-html";

/**
 * The owner's own notes for a session. Stored as sanitized HTML (the editor's
 * native format) with a monotonically increasing revision so a stale save can
 * never overwrite a newer one.
 */
export interface PersonalNotesDoc {
  content: string;
  revision: number;
  updatedAt: string | null;
}

export type EnhancedNotesStatus =
  /** Never generated. */
  | "idle"
  | "generating"
  | "ready"
  /** Generation ran but there was nothing to write from (no notes, no transcript). */
  | "empty"
  | "error";

/**
 * Kivo's rewrite of the personal notes against the room transcript. Editable,
 * so it carries its own revision; `editedAt` marks manual edits since the last
 * generation, which regeneration must not silently overwrite.
 */
export interface EnhancedNotesDoc {
  content: string;
  revision: number;
  status: EnhancedNotesStatus;
  error: string | null;
  generatedAt: string | null;
  editedAt: string | null;
  /** Personal-notes revision the last generation read. */
  sourceNotesRevision: number | null;
  /** Transcript length the last generation read. */
  sourceTurnCount: number | null;
  updatedAt: string | null;
}

export interface SessionNotesResponse {
  personal: PersonalNotesDoc;
  enhanced: EnhancedNotesDoc;
}

export const EMPTY_PERSONAL_NOTES: PersonalNotesDoc = {
  content: "",
  revision: 0,
  updatedAt: null,
};

export const EMPTY_ENHANCED_NOTES: EnhancedNotesDoc = {
  content: "",
  revision: 0,
  status: "idle",
  error: null,
  generatedAt: null,
  editedAt: null,
  sourceNotesRevision: null,
  sourceTurnCount: null,
  updatedAt: null,
};

export const SaveNotesSchema = z.object({
  content: z.string().max(MAX_NOTES_HTML_CHARS),
  /** Revision the client last saw; the save is refused if the store moved on. */
  baseRevision: z.number().int().min(0),
});

export const GenerateEnhancedNotesSchema = z.object({
  /** Replace manual edits to the enhanced notes. Off by default on purpose. */
  force: z.boolean().optional(),
});

/** Thrown (and mapped to 409) when a save's base revision is stale. */
export class NotesRevisionConflictError extends Error {
  constructor(
    public readonly current: PersonalNotesDoc | EnhancedNotesDoc
  ) {
    super("These notes changed elsewhere. Reload to pick up the latest version.");
    this.name = "NotesRevisionConflictError";
  }
}

/** Thrown (and mapped to 409) when regeneration would discard manual edits. */
export class EnhancedNotesEditedError extends Error {
  constructor(public readonly current: EnhancedNotesDoc) {
    super("The enhanced notes have been edited by hand. Regenerating will replace those edits.");
    this.name = "EnhancedNotesEditedError";
  }
}

/** Thrown (and mapped to 409) when a generation is already running. */
export class EnhancedNotesBusyError extends Error {
  constructor(public readonly current: EnhancedNotesDoc) {
    super("Kivo is already writing the enhanced notes.");
    this.name = "EnhancedNotesBusyError";
  }
}
