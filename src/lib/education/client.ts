"use client";

import { auth } from "@/lib/firebase/client";
import { EducationStateSchema, type EducationMutation } from "./model";

export async function educationRequest(uid: string, mutation?: EducationMutation) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error("Sign in to save your tips.");
  const token = await user.getIdToken();
  const response = await fetch("/api/education", {
    method: mutation ? "PATCH" : "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(mutation ? { body: JSON.stringify(mutation) } : {}),
  });
  if (!response.ok) throw new Error("Couldn’t save your tips. Try again when you’re connected.");
  return EducationStateSchema.parse(await response.json());
}
