import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import {
  applyEducationMutation, EducationStateSchema, initialEducationState,
  type EducationMutation, type EducationState,
} from "./model";

function educationRef(uid: string) {
  return getAdminDb().collection("users").doc(uid).collection("private").doc("education");
}

async function initialState(uid: string) {
  const user = await getAdminAuth().getUser(uid);
  return initialEducationState(user.metadata.creationTime);
}

export async function readEducation(uid: string): Promise<EducationState> {
  const snapshot = await educationRef(uid).get();
  return snapshot.exists ? EducationStateSchema.parse(snapshot.data()) : initialState(uid);
}

export async function updateEducation(uid: string, mutation: EducationMutation): Promise<EducationState> {
  const ref = educationRef(uid);
  const fallback = await initialState(uid);
  return getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? EducationStateSchema.parse(snapshot.data()) : fallback;
    const next = applyEducationMutation(current, mutation);
    if (!snapshot.exists || next !== current) transaction.set(ref, next);
    return next;
  });
}
