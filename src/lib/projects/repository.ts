import {
  FieldValue,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ProjectDoc, ProjectStatus } from "@/lib/projects/types";

function projectsCol(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("projects");
}

function projectRef(db: Firestore, uid: string, projectId: string) {
  return projectsCol(db, uid).doc(projectId);
}

function sessionsCol(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("sessions");
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

function mapProject(id: string, data: DocumentData): ProjectDoc {
  return {
    id,
    name: String(data.name ?? "Untitled project"),
    instructions: String(data.instructions ?? ""),
    status: (data.status ?? "active") as ProjectStatus,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    archivedAt: data.archivedAt ? toIso(data.archivedAt) : null,
  };
}

export async function listProjects(
  uid: string,
  input: { status?: ProjectStatus; includeArchived?: boolean } = {}
): Promise<ProjectDoc[]> {
  const db = getAdminDb();
  const snap = await projectsCol(db, uid).orderBy("updatedAt", "desc").get();
  let projects = snap.docs.map((doc) => mapProject(doc.id, doc.data()));

  if (input.status) {
    projects = projects.filter((project) => project.status === input.status);
  } else if (!input.includeArchived) {
    projects = projects.filter((project) => project.status !== "archived");
  }

  return projects;
}

export async function getProject(
  uid: string,
  projectId: string
): Promise<ProjectDoc | null> {
  const db = getAdminDb();
  const snap = await projectRef(db, uid, projectId).get();
  if (!snap.exists) return null;
  return mapProject(snap.id, snap.data() ?? {});
}

export async function assertActiveProjectOwner(uid: string, projectId: string) {
  const project = await getProject(uid, projectId);
  if (!project || project.status === "archived") {
    throw new Error("Project not found.");
  }
  return project;
}

export async function createProject(
  uid: string,
  input: { name: string; instructions?: string }
): Promise<ProjectDoc> {
  const db = getAdminDb();
  const ref = projectsCol(db, uid).doc();
  const now = FieldValue.serverTimestamp();

  await ref.set({
    name: input.name.trim(),
    instructions: input.instructions?.trim() ?? "",
    status: "active",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  });

  const snap = await ref.get();
  return mapProject(ref.id, snap.data() ?? {});
}

export async function patchProject(
  uid: string,
  projectId: string,
  patch: {
    name?: string;
    instructions?: string;
    status?: ProjectStatus;
  }
): Promise<ProjectDoc> {
  const db = getAdminDb();
  const ref = projectRef(db, uid, projectId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Project not found.");

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.instructions !== undefined) {
    updates.instructions = patch.instructions.trim();
  }
  if (patch.status !== undefined) {
    updates.status = patch.status;
    updates.archivedAt =
      patch.status === "archived" ? FieldValue.serverTimestamp() : null;
  }

  await ref.update(updates);
  const next = await ref.get();
  return mapProject(ref.id, next.data() ?? {});
}

export async function archiveProjectAndUnassignSessions(
  uid: string,
  projectId: string
): Promise<void> {
  const db = getAdminDb();
  const project = await getProject(uid, projectId);
  if (!project) throw new Error("Project not found.");

  const sessionsSnap = await sessionsCol(db, uid)
    .where("projectId", "==", projectId)
    .get();
  let batch = db.batch();
  let writes = 0;

  for (const doc of sessionsSnap.docs) {
    batch.update(doc.ref, {
      projectId: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    writes += 1;
    if (writes === 450) {
      await batch.commit();
      batch = db.batch();
      writes = 0;
    }
  }

  batch.update(projectRef(db, uid, projectId), {
    status: "archived",
    archivedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}
