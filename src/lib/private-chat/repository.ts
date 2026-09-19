import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { PrivateChatMessage, PrivateChatRole } from "@/lib/private-chat/types";

/**
 *   users/{uid}/sessions/{sessionId}/chat/{messageId}
 *
 * Separate from `turns` on purpose — see `PrivateChatMessage`.
 */
function chatCol(db: Firestore, uid: string, sessionId: string) {
  return db
    .collection("users")
    .doc(uid)
    .collection("sessions")
    .doc(sessionId)
    .collection("chat");
}

export function mapPrivateChatMessage(
  id: string,
  data: DocumentData
): PrivateChatMessage {
  const role: PrivateChatRole = data.role === "assistant" ? "assistant" : "user";
  return {
    id,
    role,
    text: typeof data.text === "string" ? data.text : "",
    sequence: typeof data.sequence === "number" ? data.sequence : 0,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    ...(data.interrupted ? { interrupted: true } : {}),
  };
}

export async function listPrivateChatMessages(
  uid: string,
  sessionId: string,
  limit = 200
): Promise<PrivateChatMessage[]> {
  const db = getAdminDb();
  const snap = await chatCol(db, uid, sessionId)
    .orderBy("sequence", "desc")
    .limit(limit)
    .get();
  return snap.docs
    .map((doc) => mapPrivateChatMessage(doc.id, doc.data()))
    .reverse();
}

export async function appendPrivateChatMessage(
  uid: string,
  sessionId: string,
  input: { role: PrivateChatRole; text: string; interrupted?: boolean }
): Promise<PrivateChatMessage> {
  const db = getAdminDb();
  const ref = chatCol(db, uid, sessionId).doc();
  const now = new Date();
  const data = {
    role: input.role,
    text: input.text,
    // Wall-clock sequence: a question always lands before its answer within one
    // request, and the client serializes requests, so this orders correctly
    // without a counter document.
    sequence: now.getTime(),
    createdAt: now.toISOString(),
    ...(input.interrupted ? { interrupted: true } : {}),
  };
  await ref.set(data);
  return mapPrivateChatMessage(ref.id, data);
}
