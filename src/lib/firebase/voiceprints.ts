"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Voiceprint } from "@/lib/types";

const MAX_CENTROID_LENGTH = 1024;

export function slugifyVoiceprintId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function voiceprintsCollection(uid: string) {
  return collection(db, "users", uid, "voiceprints");
}

export async function loadVoiceprints(uid: string): Promise<Voiceprint[]> {
  const snap = await getDocs(voiceprintsCollection(uid));
  const out: Voiceprint[] = [];
  for (const d of snap.docs) {
    const data = d.data() as Partial<Voiceprint>;
    if (
      typeof data.name !== "string" ||
      !Array.isArray(data.centroid) ||
      data.centroid.length === 0 ||
      data.centroid.length > MAX_CENTROID_LENGTH ||
      data.centroid.some((v) => typeof v !== "number" || !Number.isFinite(v))
    ) {
      continue;
    }
    out.push({
      name: data.name,
      centroid: data.centroid as number[],
      sampleCount: Math.max(1, data.sampleCount ?? 1),
    });
  }
  return out;
}

export async function saveVoiceprint(
  uid: string,
  print: Voiceprint
): Promise<void> {
  if (print.centroid.length === 0 || print.centroid.length > MAX_CENTROID_LENGTH) {
    throw new Error("Invalid voiceprint dimensionality.");
  }
  const slug = slugifyVoiceprintId(print.name);
  if (!slug) throw new Error("Voiceprint name produced an empty slug.");

  const ref = doc(db, "users", uid, "voiceprints", slug);
  await setDoc(
    ref,
    {
      name: print.name,
      centroid: print.centroid,
      sampleCount: print.sampleCount,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteVoiceprint(
  uid: string,
  name: string
): Promise<void> {
  const slug = slugifyVoiceprintId(name);
  if (!slug) return;
  await deleteDoc(doc(db, "users", uid, "voiceprints", slug));
}
