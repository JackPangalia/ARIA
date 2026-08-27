import {
  FieldValue,
  type DocumentData,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";
import { extractSearchTerms } from "@/lib/aria/context/question-text";
import { filterContextEligibleTurns } from "@/lib/aria/context/turn-selection";
import { estimateTokens } from "@/lib/aria/context/token-estimate";
import {
  CONTEXT_TURN_OVERFETCH,
  CONTEXT_TURN_SCAN_LIMIT,
  MAX_SEARCH_HITS,
  SEARCH_PREVIEW_LENGTH,
} from "@/lib/sessions/constants";
import { applyCleanedTranscript } from "@/lib/sessions/cleaned-transcript";
import {
  decideQuestionFold,
  type QuestionFold,
} from "@/lib/sessions/question-fold";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertActiveProjectOwner } from "@/lib/projects/repository";
import type {
  CleanedTranscriptDoc,
  MeetingSummaryDoc,
  SessionDetailResponse,
  SessionDoc,
  SessionFactDoc,
  SessionPinDoc,
  SessionMode,
  SessionStatus,
  SessionSummaryDoc,
  TranscriptionMode,
  TurnDoc,
  TurnRole,
} from "@/lib/sessions/types";
import { parseSessionMode } from "@/lib/sessions/types";

function sessionsCol(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("sessions");
}

function sessionRef(db: Firestore, uid: string, sessionId: string) {
  return sessionsCol(db, uid).doc(sessionId);
}

function turnsCol(db: Firestore, uid: string, sessionId: string) {
  return sessionRef(db, uid, sessionId).collection("turns");
}

function summaryRef(db: Firestore, uid: string, sessionId: string) {
  return sessionRef(db, uid, sessionId).collection("context").doc("summary");
}

function meetingSummaryRef(db: Firestore, uid: string, sessionId: string) {
  return sessionRef(db, uid, sessionId)
    .collection("context")
    .doc("meetingSummary");
}

function cleanedTranscriptRef(db: Firestore, uid: string, sessionId: string) {
  return sessionRef(db, uid, sessionId)
    .collection("context")
    .doc("cleanedTranscript");
}

function factsCol(db: Firestore, uid: string, sessionId: string) {
  return sessionRef(db, uid, sessionId).collection("facts");
}

function pinsCol(db: Firestore, uid: string, sessionId: string) {
  return sessionRef(db, uid, sessionId).collection("pins");
}


function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function mapSession(id: string, data: DocumentData): SessionDoc {
  const transcriptionMode: TranscriptionMode =
    data.transcriptionMode === "basic" ? "basic" : "speaker";
  return {
    id,
    title: String(data.title ?? "Untitled conversation"),
    projectId: data.projectId ? String(data.projectId) : null,
    autoTitled: Boolean(data.autoTitled),
    status: (data.status ?? "active") as SessionStatus,
    speakerCount: Number(data.speakerCount ?? 2),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    endedAt: data.endedAt ? toIso(data.endedAt) : null,
    trashedAt: data.trashedAt ? toIso(data.trashedAt) : null,
    lastSummaryAt: data.lastSummaryAt ? toIso(data.lastSummaryAt) : null,
    tokenEstimate: Number(data.tokenEstimate ?? 0),
    searchableTextPreview: String(data.searchableTextPreview ?? ""),
    turnCount: Number(data.turnCount ?? 0),
    pinned: Boolean(data.pinned),
    mode: parseSessionMode(data.mode),
    transcriptionMode,
    botId: data.botId ? String(data.botId) : null,
    meetingPlatform: data.meetingPlatform
      ? (String(data.meetingPlatform) as SessionDoc["meetingPlatform"])
      : null,
    botStatus: data.botStatus
      ? (String(data.botStatus) as SessionDoc["botStatus"])
      : null,
  };
}

function mapTurn(id: string, data: DocumentData): TurnDoc {
  return {
    id,
    role: data.role as TurnRole,
    text: String(data.text ?? ""),
    speaker: data.speaker == null ? null : Number(data.speaker),
    speakerName: data.speakerName == null ? null : String(data.speakerName),
    providerSpeakerLabel:
      data.providerSpeakerLabel == null
        ? null
        : String(data.providerSpeakerLabel),
    sourceUtteranceIds: Array.isArray(data.sourceUtteranceIds)
      ? data.sourceUtteranceIds.map(String)
      : [],
    sequence: Number(data.sequence ?? 0),
    tokenEstimate: Number(data.tokenEstimate ?? 0),
    summarized: Boolean(data.summarized),
    createdAt: toIso(data.createdAt),
    interrupted: Boolean(data.interrupted),
    heardChars: data.heardChars == null ? null : Number(data.heardChars),
  };
}

function mapSummary(data: DocumentData): SessionSummaryDoc {
  return {
    rollingSummary: String(data.rollingSummary ?? ""),
    keyDecisions: Array.isArray(data.keyDecisions)
      ? data.keyDecisions.map(String)
      : [],
    openQuestions: Array.isArray(data.openQuestions)
      ? data.openQuestions.map(String)
      : [],
    timeline: Array.isArray(data.timeline) ? data.timeline.map(String) : [],
    lastCoveredTurnId: data.lastCoveredTurnId
      ? String(data.lastCoveredTurnId)
      : null,
    updatedAt: toIso(data.updatedAt),
  };
}

function mapMeetingSummary(data: DocumentData): MeetingSummaryDoc {
  return {
    overview: String(data.overview ?? ""),
    keyPoints: Array.isArray(data.keyPoints) ? data.keyPoints.map(String) : [],
    decisions: Array.isArray(data.decisions) ? data.decisions.map(String) : [],
    actionItems: Array.isArray(data.actionItems)
      ? data.actionItems.map(String)
      : [],
    generatedAt: toIso(data.generatedAt),
    turnCountAtGeneration: Number(data.turnCountAtGeneration ?? 0),
  };
}

function mapCleanedTranscript(data: DocumentData): CleanedTranscriptDoc {
  const turns = data.turns;
  return {
    turns: Array.isArray(turns)
      ? turns.map((turn) => ({
          sourceTurnIds: Array.isArray(turn?.sourceTurnIds)
            ? turn.sourceTurnIds.map(String)
            : [],
          text: String(turn?.text ?? ""),
        }))
      : [],
    generatedAt: toIso(data.generatedAt),
    turnCountAtGeneration: Number(data.turnCountAtGeneration ?? 0),
    model: String(data.model ?? ""),
  };
}

function mapFact(id: string, data: DocumentData): SessionFactDoc {
  return {
    id,
    text: String(data.text ?? ""),
    category: (data.category ?? "fact") as SessionFactDoc["category"],
    pinned: Boolean(data.pinned),
    sourceTurnId: data.sourceTurnId ? String(data.sourceTurnId) : null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function mapPin(id: string, data: DocumentData): SessionPinDoc {
  return {
    id,
    turnId: String(data.turnId ?? ""),
    label: String(data.label ?? "Pinned"),
    snippet: String(data.snippet ?? ""),
    createdAt: toIso(data.createdAt),
  };
}

function defaultTitle(): string {
  const now = new Date();
  return `Conversation ${now.toLocaleDateString()} ${now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function appendPreview(current: string, addition: string): string {
  const next = [current, addition].filter(Boolean).join("\n").trim();
  if (next.length <= SEARCH_PREVIEW_LENGTH) return next;
  return next.slice(-SEARCH_PREVIEW_LENGTH);
}

export async function createSession(
  uid: string,
  input: {
    title?: string;
    speakerCount: number;
    projectId?: string | null;
    transcriptionMode: TranscriptionMode;
    mode?: SessionMode;
  }
): Promise<SessionDoc> {
  const db = getAdminDb();
  const ref = sessionsCol(db, uid).doc();
  const now = FieldValue.serverTimestamp();
  const title = input.title?.trim() || defaultTitle();
  const projectId = input.projectId?.trim() || null;

  if (projectId) {
    await assertActiveProjectOwner(uid, projectId);
  }

  await ref.set({
    title,
    projectId,
    autoTitled: false,
    status: "active",
    speakerCount: input.speakerCount,
    transcriptionMode: input.transcriptionMode,
    mode: input.mode ?? "in_person",
    createdAt: now,
    updatedAt: now,
    endedAt: null,
    trashedAt: null,
    lastSummaryAt: null,
    tokenEstimate: 0,
    searchableTextPreview: "",
    turnCount: 0,
    pinned: false,
  });

  const snap = await ref.get();
  return mapSession(ref.id, snap.data() ?? {});
}

export async function listSessions(
  uid: string,
  input: {
    status?: SessionStatus;
    q?: string;
    limit: number;
    since?: string | null;
    projectId?: string;
    unassigned?: boolean;
  }
): Promise<SessionDoc[]> {
  const db = getAdminDb();
  let query: Query = sessionsCol(db, uid).orderBy("updatedAt", "desc");

  if (input.status) {
    query = query.where("status", "==", input.status);
  }

  // Project filters are applied in memory (same as unassigned) so listing works
  // without a projectId+updatedAt composite index while indexes are building.
  const needsProjectFilter = Boolean(input.projectId) || Boolean(input.unassigned);
  const fetchLimit = needsProjectFilter
    ? Math.min(Math.max(input.limit * 5, 100), 300)
    : input.limit;

  query = query.limit(fetchLimit);
  const snap = await query.get();
  let sessions = snap.docs.map((doc) => mapSession(doc.id, doc.data()));

  if (input.projectId) {
    sessions = sessions.filter((session) => session.projectId === input.projectId);
  } else if (input.unassigned) {
    sessions = sessions.filter((session) => !session.projectId);
  }

  if (!input.status) {
    sessions = sessions.filter((s) => s.status !== "trashed");
  }

  // Plan history retention: hide (never delete) sessions older than the window.
  if (input.since) {
    const since = input.since;
    sessions = sessions.filter((s) => s.updatedAt >= since);
  }

  if (input.q) {
    const needle = input.q.toLowerCase();
    sessions = sessions.filter(
      (session) =>
        session.title.toLowerCase().includes(needle) ||
        session.searchableTextPreview.toLowerCase().includes(needle)
    );
  }

  sessions.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return sessions.slice(0, input.limit);
}

/** True when the user has at least one session doc (any status). */
export async function userHasAnySession(uid: string): Promise<boolean> {
  const db = getAdminDb();
  const snap = await sessionsCol(db, uid).limit(1).get();
  return !snap.empty;
}

export async function getSession(
  uid: string,
  sessionId: string
): Promise<SessionDoc | null> {
  const db = getAdminDb();
  const snap = await sessionRef(db, uid, sessionId).get();
  if (!snap.exists) return null;
  return mapSession(snap.id, snap.data() ?? {});
}

export async function assertSessionOwner(uid: string, sessionId: string) {
  const session = await getSession(uid, sessionId);
  if (!session) {
    throw new Error("Conversation not found.");
  }
  return session;
}

export async function patchSession(
  uid: string,
  sessionId: string,
  patch: {
    title?: string;
    status?: SessionStatus;
    speakerCount?: number;
    pinned?: boolean;
    autoTitled?: boolean;
    projectId?: string | null;
    mode?: SessionMode;
  }
): Promise<SessionDoc> {
  const db = getAdminDb();
  const ref = sessionRef(db, uid, sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Conversation not found.");
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (patch.title !== undefined) {
    updates.title = patch.title;
    if (patch.autoTitled === undefined) {
      updates.autoTitled = false;
    }
  }
  if (patch.autoTitled !== undefined) updates.autoTitled = patch.autoTitled;
  if (patch.pinned !== undefined) updates.pinned = patch.pinned;
  if (patch.speakerCount !== undefined) updates.speakerCount = patch.speakerCount;
  if (patch.mode !== undefined) updates.mode = patch.mode;
  if (patch.projectId !== undefined) {
    const projectId = patch.projectId?.trim() || null;
    if (projectId) {
      await assertActiveProjectOwner(uid, projectId);
    }
    updates.projectId = projectId;
  }
  if (patch.status !== undefined) {
    updates.status = patch.status;
    if (patch.status === "ended" || patch.status === "archived") {
      updates.endedAt = FieldValue.serverTimestamp();
    }
    if (patch.status === "trashed") {
      updates.trashedAt = FieldValue.serverTimestamp();
    }
    if (patch.status === "active") {
      updates.endedAt = null;
      updates.trashedAt = null;
    }
  }

  await ref.update(updates);
  const next = await ref.get();
  return mapSession(sessionId, next.data() ?? {});
}

export async function setSessionBotState(
  uid: string,
  sessionId: string,
  patch: {
    mode?: SessionDoc["mode"];
    botId?: string | null;
    meetingPlatform?: SessionDoc["meetingPlatform"];
    botStatus?: SessionDoc["botStatus"];
  }
): Promise<SessionDoc> {
  const db = getAdminDb();
  const ref = sessionRef(db, uid, sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Conversation not found.");
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (patch.mode !== undefined) updates.mode = patch.mode;
  if (patch.botId !== undefined) updates.botId = patch.botId;
  if (patch.meetingPlatform !== undefined) {
    updates.meetingPlatform = patch.meetingPlatform;
  }
  if (patch.botStatus !== undefined) updates.botStatus = patch.botStatus;

  await ref.update(updates);
  const next = await ref.get();
  return mapSession(sessionId, next.data() ?? {});
}

export async function deleteSession(
  uid: string,
  sessionId: string
): Promise<void> {
  const db = getAdminDb();
  const ref = sessionRef(db, uid, sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Conversation not found.");
  }
  await db.recursiveDelete(ref);
}

export async function getNextSequence(
  uid: string,
  sessionId: string
): Promise<number> {
  const db = getAdminDb();
  const snap = await turnsCol(db, uid, sessionId)
    .orderBy("sequence", "desc")
    .limit(1)
    .get();

  if (snap.empty) return 1;
  return Number(snap.docs[0]!.data().sequence ?? 0) + 1;
}

/**
 * Looks at the turns just before an incoming question and decides whether it is
 * really a new ask or another pass over one already recorded. See
 * `decideQuestionFold` for the rules; this only supplies the stored turns.
 */
async function planQuestionFold(
  db: Firestore,
  uid: string,
  sessionId: string,
  text: string
): Promise<{
  fold: QuestionFold;
  byId: Map<string, FirebaseFirestore.QueryDocumentSnapshot>;
}> {
  const snap = await turnsCol(db, uid, sessionId)
    .orderBy("sequence", "desc")
    .limit(6)
    .get();

  const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  const recent = snap.docs.map((doc) => {
    byId.set(doc.id, doc);
    const data = doc.data();
    return {
      id: doc.id,
      role: String(data.role ?? ""),
      text: String(data.text ?? ""),
      interrupted: Boolean(data.interrupted),
    };
  });

  return { fold: decideQuestionFold(recent, text), byId };
}

export async function appendTurn(
  uid: string,
  sessionId: string,
  input: {
    role: TurnRole;
    text: string;
    speaker?: number | null;
    speakerName?: string | null;
    providerSpeakerLabel?: string | null;
    sourceUtteranceIds?: string[];
    interrupted?: boolean;
  }
): Promise<TurnDoc> {
  const db = getAdminDb();
  const session = await assertSessionOwner(uid, sessionId);
  let text = input.text;

  if (input.role === "user_question") {
    const { fold, byId } = await planQuestionFold(db, uid, sessionId, text);

    if (fold.mode === "trim") {
      // The answered half stays where it is; only the new words are recorded.
      text = fold.text;
    } else if (fold.mode === "supersede" || fold.mode === "fold") {
      const target = byId.get(fold.targetId)!;
      const previousTokens = Number(target.data().tokenEstimate ?? 0);
      const mergedText =
        fold.mode === "supersede" ? fold.text : String(target.data().text ?? "");
      const mergedTokens = estimateTokens(mergedText);

      await target.ref.update({
        text: mergedText,
        tokenEstimate: mergedTokens,
        sourceUtteranceIds: [
          ...new Set([
            ...(target.data().sourceUtteranceIds ?? []),
            ...(input.sourceUtteranceIds ?? []),
          ]),
        ],
      });

      // The cut-off answers in between replied to a half-heard question that
      // no longer exists. Leaving them turns one exchange into a run of
      // truncated fragments.
      let droppedTokens = 0;
      if (fold.mode === "supersede") {
        for (const id of fold.dropTurnIds) {
          const doc = byId.get(id);
          if (!doc) continue;
          droppedTokens += Number(doc.data().tokenEstimate ?? 0);
          await doc.ref.delete();
        }
      }

      await sessionRef(db, uid, sessionId).update({
        updatedAt: FieldValue.serverTimestamp(),
        tokenEstimate: FieldValue.increment(
          mergedTokens - previousTokens - droppedTokens
        ),
      });
      const updated = await target.ref.get();
      return mapTurn(target.ref.id, updated.data() ?? {});
    }
  }

  const tokenEstimate = estimateTokens(text);

  const sequence = await getNextSequence(uid, sessionId);
  const turnRef = turnsCol(db, uid, sessionId).doc();

  await turnRef.set({
    role: input.role,
    text,
    speaker: input.speaker ?? null,
    speakerName: input.speakerName?.trim() || null,
    providerSpeakerLabel: input.providerSpeakerLabel?.trim() || null,
    sourceUtteranceIds: input.sourceUtteranceIds ?? [],
    sequence,
    tokenEstimate,
    summarized: false,
    createdAt: FieldValue.serverTimestamp(),
    ...(input.interrupted ? { interrupted: true } : {}),
  });

  await sessionRef(db, uid, sessionId).update({
    updatedAt: FieldValue.serverTimestamp(),
    turnCount: FieldValue.increment(1),
    tokenEstimate: FieldValue.increment(tokenEstimate),
    searchableTextPreview: appendPreview(session.searchableTextPreview, text),
  });

  const snap = await turnRef.get();
  return mapTurn(turnRef.id, snap.data() ?? {});
}

/**
 * Reassigns the display name on specific turns after a speaker misattribution.
 * Only `speaker` turns are touched — assistant/user_question turns carry
 * pipeline semantics — and unknown ids are skipped rather than failing the
 * batch, since the client's view can lag the store.
 */
export async function relabelTurnSpeaker(
  uid: string,
  sessionId: string,
  turnIds: string[],
  speakerName: string | null
): Promise<number> {
  const db = getAdminDb();
  await assertSessionOwner(uid, sessionId);

  // A cleaned transcript can show several raw turns merged into one line, and
  // the UI only knows that line's id. Expand back to every raw turn behind it
  // so a speaker correction reaches all of them, not just the first.
  const cleaned = await getCleanedTranscript(uid, sessionId);
  const expanded = new Set(turnIds);
  for (const entry of cleaned?.turns ?? []) {
    const [first] = entry.sourceTurnIds;
    if (first && expanded.has(first)) {
      for (const id of entry.sourceTurnIds) expanded.add(id);
    }
  }

  const col = turnsCol(db, uid, sessionId);
  const refs = [...expanded].map((id) => col.doc(id));
  const snaps = await db.getAll(...refs);

  const batch = db.batch();
  let updated = 0;
  for (const snap of snaps) {
    if (!snap.exists) continue;
    // Questions asked aloud are speech by a diarized speaker too — they are
    // just persisted by the ask pipeline instead of the transcript path. Only
    // assistant turns are off limits.
    const role = snap.data()?.role;
    if (role !== "speaker" && role !== "user_question") continue;
    batch.update(snap.ref, { speakerName: speakerName?.trim() || null });
    updated += 1;
  }
  if (updated > 0) {
    await batch.commit();
    await sessionRef(db, uid, sessionId).update({
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  return updated;
}

export async function listTurns(
  uid: string,
  sessionId: string,
  limit = 500
): Promise<TurnDoc[]> {
  const db = getAdminDb();
  const snap = await turnsCol(db, uid, sessionId)
    .orderBy("sequence", "asc")
    .limit(limit)
    .get();

  return snap.docs.map((doc) => mapTurn(doc.id, doc.data()));
}

export async function getRecentTurns(
  uid: string,
  sessionId: string,
  count: number
): Promise<TurnDoc[]> {
  const db = getAdminDb();
  const snap = await turnsCol(db, uid, sessionId)
    .orderBy("sequence", "desc")
    .limit(count)
    .get();

  return snap.docs
    .map((doc) => mapTurn(doc.id, doc.data()))
    .reverse();
}

/** Recent speaker + assistant turns for model context (not raw DB row count). */
export async function getRecentContextTurns(
  uid: string,
  sessionId: string,
  count: number
): Promise<TurnDoc[]> {
  const fetchLimit = Math.min(
    count * CONTEXT_TURN_OVERFETCH,
    CONTEXT_TURN_SCAN_LIMIT
  );
  const db = getAdminDb();
  const snap = await turnsCol(db, uid, sessionId)
    .orderBy("sequence", "desc")
    .limit(fetchLimit)
    .get();

  const eligible = filterContextEligibleTurns(
    snap.docs.map((doc) => mapTurn(doc.id, doc.data()))
  );

  return eligible.slice(0, count).reverse();
}

export async function getUnsummarizedTurns(
  uid: string,
  sessionId: string
): Promise<TurnDoc[]> {
  const db = getAdminDb();
  const snap = await turnsCol(db, uid, sessionId)
    .where("summarized", "==", false)
    .orderBy("sequence", "asc")
    .get();

  return snap.docs.map((doc) => mapTurn(doc.id, doc.data()));
}

export async function markTurnsSummarized(
  uid: string,
  sessionId: string,
  turnIds: string[]
): Promise<void> {
  if (turnIds.length === 0) return;
  const db = getAdminDb();
  const batch = db.batch();

  for (const turnId of turnIds) {
    batch.update(turnsCol(db, uid, sessionId).doc(turnId), {
      summarized: true,
    });
  }

  await batch.commit();
}

export async function getSummary(
  uid: string,
  sessionId: string
): Promise<SessionSummaryDoc | null> {
  const db = getAdminDb();
  const snap = await summaryRef(db, uid, sessionId).get();
  if (!snap.exists) return null;
  return mapSummary(snap.data() ?? {});
}

export async function upsertSummary(
  uid: string,
  sessionId: string,
  summary: Omit<SessionSummaryDoc, "updatedAt">
): Promise<SessionSummaryDoc> {
  const db = getAdminDb();
  const ref = summaryRef(db, uid, sessionId);

  await ref.set({
    ...summary,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await sessionRef(db, uid, sessionId).update({
    lastSummaryAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  return mapSummary(snap.data() ?? {});
}

export async function getMeetingSummary(
  uid: string,
  sessionId: string
): Promise<MeetingSummaryDoc | null> {
  const db = getAdminDb();
  const snap = await meetingSummaryRef(db, uid, sessionId).get();
  if (!snap.exists) return null;
  return mapMeetingSummary(snap.data() ?? {});
}

export async function upsertMeetingSummary(
  uid: string,
  sessionId: string,
  summary: Omit<MeetingSummaryDoc, "generatedAt">
): Promise<MeetingSummaryDoc> {
  const db = getAdminDb();
  const ref = meetingSummaryRef(db, uid, sessionId);

  await ref.set({
    ...summary,
    generatedAt: FieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  return mapMeetingSummary(snap.data() ?? {});
}

export async function getCleanedTranscript(
  uid: string,
  sessionId: string
): Promise<CleanedTranscriptDoc | null> {
  const db = getAdminDb();
  const snap = await cleanedTranscriptRef(db, uid, sessionId).get();
  if (!snap.exists) return null;
  return mapCleanedTranscript(snap.data() ?? {});
}

export async function upsertCleanedTranscript(
  uid: string,
  sessionId: string,
  cleaned: Omit<CleanedTranscriptDoc, "generatedAt">
): Promise<CleanedTranscriptDoc> {
  const db = getAdminDb();
  const ref = cleanedTranscriptRef(db, uid, sessionId);

  await ref.set({
    ...cleaned,
    generatedAt: FieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  return mapCleanedTranscript(snap.data() ?? {});
}

export async function listFacts(
  uid: string,
  sessionId: string
): Promise<SessionFactDoc[]> {
  const db = getAdminDb();
  const snap = await factsCol(db, uid, sessionId)
    .orderBy("updatedAt", "desc")
    .get();

  return snap.docs.map((doc) => mapFact(doc.id, doc.data()));
}

export async function upsertFacts(
  uid: string,
  sessionId: string,
  facts: Array<{
    text: string;
    category: SessionFactDoc["category"];
    sourceTurnId?: string | null;
  }>
): Promise<void> {
  if (facts.length === 0) return;
  const db = getAdminDb();
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  for (const fact of facts) {
    const ref = factsCol(db, uid, sessionId).doc();
    batch.set(ref, {
      text: fact.text,
      category: fact.category,
      pinned: false,
      sourceTurnId: fact.sourceTurnId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  await batch.commit();
}

export async function listPins(
  uid: string,
  sessionId: string
): Promise<SessionPinDoc[]> {
  const db = getAdminDb();
  const snap = await pinsCol(db, uid, sessionId)
    .orderBy("createdAt", "desc")
    .get();

  return snap.docs.map((doc) => mapPin(doc.id, doc.data()));
}

export async function createPin(
  uid: string,
  sessionId: string,
  input: { turnId: string; label?: string }
): Promise<SessionPinDoc> {
  const db = getAdminDb();
  const turnSnap = await turnsCol(db, uid, sessionId).doc(input.turnId).get();
  if (!turnSnap.exists) {
    throw new Error("Turn not found.");
  }

  const turn = mapTurn(turnSnap.id, turnSnap.data() ?? {});
  const ref = pinsCol(db, uid, sessionId).doc();

  await ref.set({
    turnId: turn.id,
    label: input.label?.trim() || "Pinned",
    snippet: turn.text.slice(0, 2000),
    createdAt: FieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  return mapPin(ref.id, snap.data() ?? {});
}

export async function deletePin(
  uid: string,
  sessionId: string,
  pinId: string
): Promise<void> {
  const db = getAdminDb();
  await pinsCol(db, uid, sessionId).doc(pinId).delete();
}

export async function getSessionDetail(
  uid: string,
  sessionId: string,
  turnLimit = 200
): Promise<SessionDetailResponse | null> {
  const session = await getSession(uid, sessionId);
  if (!session) return null;

  const [rawTurns, summary, meetingSummary, facts, pins, cleaned] =
    await Promise.all([
      listTurns(uid, sessionId, turnLimit),
      getSummary(uid, sessionId),
      getMeetingSummary(uid, sessionId),
      listFacts(uid, sessionId),
      listPins(uid, sessionId),
      getCleanedTranscript(uid, sessionId),
    ]);

  // Once a session has been cleaned, that is what the transcript shows. The
  // raw turns are still the stored record — this is an overlay, and any turn
  // the cleaner never covered passes through untouched.
  const turns = applyCleanedTranscript(rawTurns, cleaned);

  return { session, turns, summary, meetingSummary, facts, pins };
}

export async function searchTurnsInSession(
  uid: string,
  sessionId: string,
  query: string,
  limit = MAX_SEARCH_HITS
): Promise<TurnDoc[]> {
  const turns = await listTurns(uid, sessionId, 1000);
  const needle = query.toLowerCase();
  return turns
    .filter((turn) => turn.text.toLowerCase().includes(needle))
    .slice(-limit);
}

export async function searchContextTurns(
  uid: string,
  sessionId: string,
  question: string,
  limit = MAX_SEARCH_HITS,
  options?: {
    preferEarlySession?: boolean;
    excludeTurnIds?: Set<string>;
  }
): Promise<TurnDoc[]> {
  const terms = extractSearchTerms(question);
  if (terms.length === 0) return [];

  const turns = filterContextEligibleTurns(
    await listTurns(uid, sessionId, CONTEXT_TURN_SCAN_LIMIT)
  );
  if (turns.length === 0) return [];

  const maxSequence = turns[turns.length - 1]?.sequence ?? 1;
  const exclude = options?.excludeTurnIds ?? new Set<string>();

  const scored = turns
    .filter((turn) => !exclude.has(turn.id))
    .map((turn) => {
      const haystack = turn.text.toLowerCase();
      let hits = 0;
      for (const term of terms) {
        if (haystack.includes(term)) hits += 1;
      }
      if (hits === 0) return null;

      let score = hits;
      if (options?.preferEarlySession) {
        const earlyBoost = 1 - turn.sequence / Math.max(maxSequence, 1);
        score += earlyBoost * 2;
      }
      return { turn, score };
    })
    .filter((row): row is { turn: TurnDoc; score: number } => row !== null)
    .sort((a, b) => b.score - a.score || a.turn.sequence - b.turn.sequence);

  const picked: TurnDoc[] = [];
  const seen = new Set<string>();
  for (const { turn } of scored) {
    if (seen.has(turn.id)) continue;
    seen.add(turn.id);
    picked.push(turn);
    if (picked.length >= limit) break;
  }

  return picked.sort((a, b) => a.sequence - b.sequence);
}

/** Speaking rate used to map a playback position to answer text when the
 * client couldn't report a total duration (~150 wpm ≈ 15 chars/sec). */
const HEARD_CHARS_PER_SECOND = 15;

function snapToWordBoundary(text: string, chars: number): number {
  if (chars >= text.length) return text.length;
  const cut = text.lastIndexOf(" ", chars);
  return cut > 0 ? cut : chars;
}

/**
 * "Stop" arrived while the answer was playing. The turn was already persisted
 * with the full synthesized text, so record how far playback actually got —
 * context rendering truncates to what was heard. Targets the most recent
 * assistant turn; refines rather than overwrites an earlier server-side
 * estimate (abort-persisted turns keep their spoken-chunk text).
 */
export async function markLatestAssistantInterrupted(
  uid: string,
  sessionId: string,
  input: { playedSeconds: number; totalSeconds?: number | null }
): Promise<{ turnId: string; heardChars: number } | null> {
  await assertSessionOwner(uid, sessionId);
  const recent = await getRecentTurns(uid, sessionId, 6);
  const turn = [...recent].reverse().find((t) => t.role === "assistant");
  if (!turn) return null;
  // Abort-persisted turns already hold only the spoken text; a stale or
  // duplicate report must not truncate them further.
  if (turn.interrupted && turn.heardChars != null) return null;

  const total =
    input.totalSeconds && input.totalSeconds > 0 ? input.totalSeconds : null;
  const rawChars = total
    ? Math.round((input.playedSeconds / total) * turn.text.length)
    : Math.round(input.playedSeconds * HEARD_CHARS_PER_SECOND);
  const heardChars = snapToWordBoundary(
    turn.text,
    Math.max(0, Math.min(turn.text.length, rawChars))
  );
  // Heard essentially everything — not an interruption worth recording.
  if (heardChars >= turn.text.length) return null;

  const db = getAdminDb();
  await turnsCol(db, uid, sessionId).doc(turn.id).update({
    interrupted: true,
    heardChars,
  });
  return { turnId: turn.id, heardChars };
}

/** The part of an assistant turn the user actually heard before cutting it off. */
export function heardTurnText(turn: TurnDoc): string {
  if (!turn.interrupted) return turn.text;
  const heard =
    turn.heardChars != null && turn.heardChars < turn.text.length
      ? turn.text.slice(0, turn.heardChars).trimEnd()
      : turn.text;
  return heard;
}

export function formatTurnForContext(
  turn: TurnDoc,
  options?: { unregisteredLabel?: string }
): string {
  if (turn.role === "assistant") {
    return turn.interrupted
      ? `Kivo: ${heardTurnText(turn)} [the user cut this answer off here]`
      : `Kivo: ${turn.text}`;
  }
  const unregistered = options?.unregisteredLabel ?? "Unregistered speaker";
  if (turn.role === "user_question") {
    const speaker = turn.speakerName ?? unregistered;
    return `${speaker} (question): ${turn.text}`;
  }
  const speaker = turn.speakerName ?? unregistered;
  return `${speaker}: ${turn.text}`;
}
