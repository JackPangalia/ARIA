"use client";

import type { User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export async function upsertUserProfile(user: User): Promise<void> {
  const profileRef = doc(db, "users", user.uid);
  const providerIds = user.providerData.map((provider) => provider.providerId);
  const profile = {
    uid: user.uid,
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
    providerIds,
    updatedAt: serverTimestamp(),
  };

  const snapshot = await getDoc(profileRef);

  if (snapshot.exists()) {
    await setDoc(profileRef, profile, { merge: true });
    return;
  }

  await setDoc(profileRef, {
    ...profile,
    createdAt: serverTimestamp(),
  });
}
