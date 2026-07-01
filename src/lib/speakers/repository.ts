import {
  FieldValue,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { SpeakerProfileDoc } from "@/lib/speakers/types";

function profilesCol(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("speakerProfiles");
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

export function slugifySpeakerProfileId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function mapSpeakerProfile(id: string, data: DocumentData): SpeakerProfileDoc {
  return {
    id,
    name: String(data.name ?? "Unknown speaker"),
    speakerIdentifiers: Array.isArray(data.speakerIdentifiers)
      ? data.speakerIdentifiers.map(String).filter(Boolean)
      : [],
    sampleCount: Number(data.sampleCount ?? 1),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export async function listSpeakerProfiles(
  uid: string
): Promise<SpeakerProfileDoc[]> {
  const db = getAdminDb();
  const snap = await profilesCol(db, uid).orderBy("updatedAt", "desc").get();
  return snap.docs.map((doc) => mapSpeakerProfile(doc.id, doc.data()));
}

export async function upsertSpeakerProfile(
  uid: string,
  input: {
    name: string;
    speakerIdentifiers: string[];
    sampleCount?: number;
  }
): Promise<SpeakerProfileDoc> {
  const db = getAdminDb();
  const id = slugifySpeakerProfileId(input.name);
  if (!id) throw new Error("Speaker name produced an empty profile id.");

  const ref = profilesCol(db, uid).doc(id);
  const snap = await ref.get();
  const existing = snap.exists ? mapSpeakerProfile(snap.id, snap.data() ?? {}) : null;
  const now = FieldValue.serverTimestamp();
  // Re-enrollment replaces the stored voice print with the latest sample.
  const identifiers = Array.from(new Set(input.speakerIdentifiers.map(String))).filter(
    Boolean
  );
  if (identifiers.length === 0) {
    throw new Error("At least one speaker identifier is required.");
  }

  await ref.set(
    {
      name: input.name.trim(),
      speakerIdentifiers: identifiers,
      sampleCount: 1,
      createdAt: existing ? snap.data()?.createdAt ?? now : now,
      updatedAt: now,
    },
    { merge: true }
  );

  const next = await ref.get();
  return mapSpeakerProfile(ref.id, next.data() ?? {});
}

export async function patchSpeakerProfile(
  uid: string,
  profileId: string,
  patch: {
    name?: string;
    speakerIdentifiers?: string[];
    sampleCount?: number;
  }
): Promise<SpeakerProfileDoc> {
  const db = getAdminDb();
  const ref = profilesCol(db, uid).doc(profileId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Speaker profile not found.");

  const current = mapSpeakerProfile(snap.id, snap.data() ?? {});
  const nextName = patch.name?.trim() ?? current.name;
  const nextId = slugifySpeakerProfileId(nextName);
  if (!nextId) throw new Error("Speaker name produced an empty profile id.");

  const payload = {
    name: nextName,
    speakerIdentifiers: patch.speakerIdentifiers ?? current.speakerIdentifiers,
    sampleCount: patch.sampleCount ?? current.sampleCount,
    createdAt: snap.data()?.createdAt ?? FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (nextId !== profileId) {
    const nextRef = profilesCol(db, uid).doc(nextId);
    await nextRef.set(payload);
    await ref.delete();
    const next = await nextRef.get();
    return mapSpeakerProfile(nextRef.id, next.data() ?? {});
  }

  await ref.update(payload);
  const next = await ref.get();
  return mapSpeakerProfile(ref.id, next.data() ?? {});
}

export async function deleteSpeakerProfile(
  uid: string,
  profileId: string
): Promise<void> {
  const db = getAdminDb();
  await profilesCol(db, uid).doc(profileId).delete();
}
