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
import { getAdminDb } from "@/lib/firebase/admin";
import { assertActiveProjectOwner } from "@/lib/projects/repository";
import type {
  SessionDetailResponse,
  SessionDoc,
  SessionFactDoc,
  SessionPinDoc,
  SessionStatus,
  SessionSummaryDoc,
  TurnDoc,
  TurnRole,
} from "@/lib/sessions/types";

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
  return {
    id,
    title: String(data.title ?? "Untitled session"),
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
    mode: data.mode === "bot" ? "bot" : "in_person",
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
    sourceUtteranceIds: Array.isArray(data.sourceUtteranceIds)
      ? data.sourceUtteranceIds.map(String)
      : [],
    sequence: Number(data.sequence ?? 0),
    tokenEstimate: Number(data.tokenEstimate ?? 0),
    summarized: Boolean(data.summarized),
    createdAt: toIso(data.createdAt),
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
  return `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString([], {
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
  input: { title?: string; speakerCount: number; projectId?: string | null }
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
    throw new Error("Session not found.");
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
  }
): Promise<SessionDoc> {
  const db = getAdminDb();
  const ref = sessionRef(db, uid, sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Session not found.");
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
    throw new Error("Session not found.");
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
    throw new Error("Session not found.");
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

export async function appendTurn(
  uid: string,
  sessionId: string,
  input: {
    role: TurnRole;
    text: string;
    speaker?: number | null;
    speakerName?: string | null;
    sourceUtteranceIds?: string[];
  }
): Promise<TurnDoc> {
  const db = getAdminDb();
  const session = await assertSessionOwner(uid, sessionId);
  const sequence = await getNextSequence(uid, sessionId);
  const tokenEstimate = estimateTokens(input.text);
  const turnRef = turnsCol(db, uid, sessionId).doc();

  await turnRef.set({
    role: input.role,
    text: input.text,
    speaker: input.speaker ?? null,
    speakerName: input.speakerName?.trim() || null,
    sourceUtteranceIds: input.sourceUtteranceIds ?? [],
    sequence,
    tokenEstimate,
    summarized: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  await sessionRef(db, uid, sessionId).update({
    updatedAt: FieldValue.serverTimestamp(),
    turnCount: FieldValue.increment(1),
    tokenEstimate: FieldValue.increment(tokenEstimate),
    searchableTextPreview: appendPreview(
      session.searchableTextPreview,
      input.text
    ),
  });

  const snap = await turnRef.get();
  return mapTurn(turnRef.id, snap.data() ?? {});
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

  const [turns, summary, facts, pins] = await Promise.all([
    listTurns(uid, sessionId, turnLimit),
    getSummary(uid, sessionId),
    listFacts(uid, sessionId),
    listPins(uid, sessionId),
  ]);

  return { session, turns, summary, facts, pins };
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

export function formatTurnForContext(
  turn: TurnDoc,
  options?: { unregisteredLabel?: string }
): string {
  if (turn.role === "assistant") {
    return `Kivo: ${turn.text}`;
  }
  const unregistered = options?.unregisteredLabel ?? "Unregistered speaker";
  if (turn.role === "user_question") {
    const speaker = turn.speakerName ?? unregistered;
    return `${speaker} (question): ${turn.text}`;
  }
  const speaker = turn.speakerName ?? unregistered;
  return `${speaker}: ${turn.text}`;
}
