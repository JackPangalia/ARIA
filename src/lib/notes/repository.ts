import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertSessionOwner } from "@/lib/sessions/repository";
import {
  MAX_NOTES_HTML_CHARS,
  sanitizeNotesHtml,
} from "@/lib/notes/sanitize-html";
import {
  decideSave,
  generationResultSupersededByEdit,
} from "@/lib/notes/revision";
import {
  EMPTY_ENHANCED_NOTES,
  EMPTY_PERSONAL_NOTES,
  NotesRevisionConflictError,
  type EnhancedNotesDoc,
  type EnhancedNotesStatus,
  type PersonalNotesDoc,
  type SessionNotesResponse,
} from "@/lib/notes/types";

/**
 * Notes live in their own subcollection, deliberately apart from `turns` and
 * `context`: nothing in the voice path reads this collection, which is what
 * keeps personal and enhanced notes out of spoken answers.
 *
 *   users/{uid}/sessions/{sessionId}/notes/personal
 *   users/{uid}/sessions/{sessionId}/notes/enhanced
 */
function notesCol(db: Firestore, uid: string, sessionId: string) {
  return db
    .collection("users")
    .doc(uid)
    .collection("sessions")
    .doc(sessionId)
    .collection("notes");
}

function personalRef(db: Firestore, uid: string, sessionId: string) {
  return notesCol(db, uid, sessionId).doc("personal");
}

function enhancedRef(db: Firestore, uid: string, sessionId: string) {
  return notesCol(db, uid, sessionId).doc("enhanced");
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const ENHANCED_STATUSES: EnhancedNotesStatus[] = [
  "idle",
  "generating",
  "ready",
  "empty",
  "error",
];

export function mapPersonalNotes(data: DocumentData | undefined): PersonalNotesDoc {
  if (!data) return EMPTY_PERSONAL_NOTES;
  return {
    content: asString(data.content),
    revision: asNullableNumber(data.revision) ?? 0,
    updatedAt: asNullableString(data.updatedAt),
  };
}

export function mapEnhancedNotes(data: DocumentData | undefined): EnhancedNotesDoc {
  if (!data) return EMPTY_ENHANCED_NOTES;
  const status = asString(data.status, "idle") as EnhancedNotesStatus;
  return {
    content: asString(data.content),
    revision: asNullableNumber(data.revision) ?? 0,
    status: ENHANCED_STATUSES.includes(status) ? status : "idle",
    error: asNullableString(data.error),
    generatedAt: asNullableString(data.generatedAt),
    editedAt: asNullableString(data.editedAt),
    sourceNotesRevision: asNullableNumber(data.sourceNotesRevision),
    sourceTurnCount: asNullableNumber(data.sourceTurnCount),
    updatedAt: asNullableString(data.updatedAt),
  };
}

export async function getSessionNotes(
  uid: string,
  sessionId: string
): Promise<SessionNotesResponse> {
  await assertSessionOwner(uid, sessionId);
  const db = getAdminDb();
  const [personal, enhanced] = await Promise.all([
    personalRef(db, uid, sessionId).get(),
    enhancedRef(db, uid, sessionId).get(),
  ]);
  return {
    personal: mapPersonalNotes(personal.data()),
    enhanced: mapEnhancedNotes(enhanced.data()),
  };
}

export async function getPersonalNotes(
  uid: string,
  sessionId: string
): Promise<PersonalNotesDoc> {
  const db = getAdminDb();
  const snap = await personalRef(db, uid, sessionId).get();
  return mapPersonalNotes(snap.data());
}

export async function getEnhancedNotes(
  uid: string,
  sessionId: string
): Promise<EnhancedNotesDoc> {
  const db = getAdminDb();
  const snap = await enhancedRef(db, uid, sessionId).get();
  return mapEnhancedNotes(snap.data());
}

function prepareContent(content: string): string {
  const sanitized = sanitizeNotesHtml(content);
  if (sanitized.length > MAX_NOTES_HTML_CHARS) {
    throw new Error("These notes are too long to save.");
  }
  return sanitized;
}

/**
 * Compare-and-set save: the client sends the revision it last saw and the
 * write only lands if the store still agrees. A delayed autosave from an
 * older tab therefore conflicts instead of clobbering newer work.
 */
export async function savePersonalNotes(
  uid: string,
  sessionId: string,
  input: { content: string; baseRevision: number }
): Promise<PersonalNotesDoc> {
  await assertSessionOwner(uid, sessionId);
  const db = getAdminDb();
  const ref = personalRef(db, uid, sessionId);
  const content = prepareContent(input.content);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = mapPersonalNotes(snap.data());
    const decision = decideSave(current.revision, input.baseRevision);
    if (decision.kind === "conflict") {
      throw new NotesRevisionConflictError(current);
    }
    const next: PersonalNotesDoc = {
      content,
      revision: decision.nextRevision,
      updatedAt: new Date().toISOString(),
    };
    tx.set(ref, next);
    return next;
  });
}

/** Manual edit of the enhanced notes. Marks them edited so regeneration asks first. */
export async function saveEnhancedNotes(
  uid: string,
  sessionId: string,
  input: { content: string; baseRevision: number }
): Promise<EnhancedNotesDoc> {
  await assertSessionOwner(uid, sessionId);
  const db = getAdminDb();
  const ref = enhancedRef(db, uid, sessionId);
  const content = prepareContent(input.content);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = mapEnhancedNotes(snap.data());
    const decision = decideSave(current.revision, input.baseRevision);
    if (decision.kind === "conflict") {
      throw new NotesRevisionConflictError(current);
    }
    const now = new Date().toISOString();
    const next: EnhancedNotesDoc = {
      ...current,
      content,
      revision: decision.nextRevision,
      // A hand-edited document is "ready" whatever the last generation did.
      status: "ready",
      error: null,
      editedAt: now,
      updatedAt: now,
    };
    tx.set(ref, next);
    return next;
  });
}

/** Flags a generation in progress. Revision is untouched — nothing changed yet. */
export async function markEnhancedNotesGenerating(
  uid: string,
  sessionId: string
): Promise<EnhancedNotesDoc> {
  const db = getAdminDb();
  const ref = enhancedRef(db, uid, sessionId);
  const snap = await ref.get();
  const current = mapEnhancedNotes(snap.data());
  const next: EnhancedNotesDoc = {
    ...current,
    status: "generating",
    error: null,
    updatedAt: new Date().toISOString(),
  };
  await ref.set(next);
  return next;
}

export async function markEnhancedNotesFailed(
  uid: string,
  sessionId: string,
  message: string
): Promise<EnhancedNotesDoc> {
  const db = getAdminDb();
  const ref = enhancedRef(db, uid, sessionId);
  const snap = await ref.get();
  const current = mapEnhancedNotes(snap.data());
  const next: EnhancedNotesDoc = {
    ...current,
    // Content from an earlier run stays readable; only the status reports it.
    status: current.content ? "ready" : "error",
    error: message,
    updatedAt: new Date().toISOString(),
  };
  await ref.set(next);
  return next;
}

export async function markEnhancedNotesEmpty(
  uid: string,
  sessionId: string
): Promise<EnhancedNotesDoc> {
  const db = getAdminDb();
  const ref = enhancedRef(db, uid, sessionId);
  const snap = await ref.get();
  const current = mapEnhancedNotes(snap.data());
  const next: EnhancedNotesDoc = {
    ...current,
    status: current.content ? "ready" : "empty",
    error: null,
    updatedAt: new Date().toISOString(),
  };
  await ref.set(next);
  return next;
}

/**
 * Lands a finished generation — unless the notes were edited by hand while the
 * model was writing, in which case the edits win and the result is dropped.
 */
export async function writeGeneratedEnhancedNotes(
  uid: string,
  sessionId: string,
  input: {
    content: string;
    generationStartedAt: string;
    sourceNotesRevision: number;
    sourceTurnCount: number;
  }
): Promise<{ doc: EnhancedNotesDoc; applied: boolean }> {
  const db = getAdminDb();
  const ref = enhancedRef(db, uid, sessionId);
  const content = prepareContent(input.content);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = mapEnhancedNotes(snap.data());
    const now = new Date().toISOString();

    if (generationResultSupersededByEdit(current, input.generationStartedAt)) {
      const kept: EnhancedNotesDoc = {
        ...current,
        status: "ready",
        error: null,
        updatedAt: now,
      };
      tx.set(ref, kept);
      return { doc: kept, applied: false };
    }

    const next: EnhancedNotesDoc = {
      content,
      revision: current.revision + 1,
      status: "ready",
      error: null,
      generatedAt: now,
      editedAt: null,
      sourceNotesRevision: input.sourceNotesRevision,
      sourceTurnCount: input.sourceTurnCount,
      updatedAt: now,
    };
    tx.set(ref, next);
    return { doc: next, applied: true };
  });
}
