import {
  FieldValue,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import mammoth from "mammoth";
import { extractText as extractPdfText } from "unpdf";
import { estimateTokens } from "@/lib/aria/context/token-estimate";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertActiveProjectOwner } from "@/lib/projects/repository";
import type {
  ProjectSourceDoc,
  ProjectSourceKind,
} from "@/lib/projects/types";
import {
  PROJECT_SOURCE_MAX_CHARS,
  PROJECT_SOURCES_TOKEN_BUDGET,
} from "@/lib/sessions/constants";

const MAX_SOURCE_BYTES = 2_000_000;

const CODE_EXTENSIONS = new Set([
  "css",
  "go",
  "html",
  "java",
  "js",
  "jsx",
  "kt",
  "mjs",
  "php",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "swift",
  "ts",
  "tsx",
  "vue",
  "yaml",
  "yml",
]);

function projectsCol(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("projects");
}

function sourcesCol(db: Firestore, uid: string, projectId: string) {
  return projectsCol(db, uid).doc(projectId).collection("sources");
}

function sourceRef(
  db: Firestore,
  uid: string,
  projectId: string,
  sourceId: string
) {
  return sourcesCol(db, uid, projectId).doc(sourceId);
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

function mapSource(id: string, data: DocumentData): ProjectSourceDoc {
  return {
    id,
    name: String(data.name ?? "Untitled source"),
    mimeType: String(data.mimeType ?? "application/octet-stream"),
    kind: (data.kind ?? "text") as ProjectSourceKind,
    byteSize: Number(data.byteSize ?? 0),
    charCount: Number(data.charCount ?? 0),
    tokenEstimate: Number(data.tokenEstimate ?? 0),
    text: String(data.text ?? ""),
    status: data.status === "error" ? "error" : "ready",
    error: data.error ? String(data.error) : null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function extensionFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext === name.toLowerCase() ? "" : ext;
}

export function detectProjectSourceKind(
  name: string,
  mimeType: string
): ProjectSourceKind {
  const ext = extensionFor(name);
  const lowerMime = mimeType.toLowerCase();

  if (ext === "pdf" || lowerMime === "application/pdf") return "pdf";
  if (
    ext === "docx" ||
    lowerMime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "csv" || lowerMime.includes("csv")) return "csv";
  if (ext === "json" || lowerMime.includes("json")) return "json";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  return "text";
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export async function extractProjectSourceText(input: {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<{ kind: ProjectSourceKind; text: string }> {
  if (input.bytes.byteLength > MAX_SOURCE_BYTES) {
    throw new Error("Source file is too large. Keep files under 2 MB for now.");
  }

  const kind = detectProjectSourceKind(input.name, input.mimeType);
  let text = "";

  if (kind === "pdf") {
    const result = await extractPdfText(input.bytes, { mergePages: true });
    text = result.text;
  } else if (kind === "docx") {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(input.bytes),
    });
    text = result.value;
  } else {
    text = decodeText(input.bytes);
  }

  const normalized = normalizeExtractedText(text);
  if (!normalized) {
    throw new Error("No readable text could be extracted from that source.");
  }
  if (normalized.length > PROJECT_SOURCE_MAX_CHARS) {
    throw new Error("Extracted source text is too large for this version.");
  }

  return { kind, text: normalized };
}

export async function listSources(
  uid: string,
  projectId: string
): Promise<ProjectSourceDoc[]> {
  const db = getAdminDb();
  await assertActiveProjectOwner(uid, projectId);
  const snap = await sourcesCol(db, uid, projectId).orderBy("createdAt", "desc").get();
  return snap.docs.map((doc) => mapSource(doc.id, doc.data()));
}

export async function listSourcesForContext(
  uid: string,
  projectId: string,
  tokenBudget = PROJECT_SOURCES_TOKEN_BUDGET
): Promise<ProjectSourceDoc[]> {
  const db = getAdminDb();
  await assertActiveProjectOwner(uid, projectId);
  const snap = await sourcesCol(db, uid, projectId).orderBy("createdAt", "asc").get();

  const sources: ProjectSourceDoc[] = [];
  let tokens = 0;
  for (const doc of snap.docs) {
    const source = mapSource(doc.id, doc.data());
    if (source.status !== "ready") continue;
    if (tokens + source.tokenEstimate > tokenBudget) break;
    sources.push(source);
    tokens += source.tokenEstimate;
  }
  return sources;
}

export async function createSource(
  uid: string,
  projectId: string,
  input: {
    name: string;
    mimeType: string;
    kind: ProjectSourceKind;
    byteSize: number;
    text: string;
  }
): Promise<ProjectSourceDoc> {
  const db = getAdminDb();
  await assertActiveProjectOwner(uid, projectId);

  const tokenEstimate = estimateTokens(input.text);
  const existing = await listSources(uid, projectId);
  const existingTokens = existing
    .filter((source) => source.status === "ready")
    .reduce((sum, source) => sum + source.tokenEstimate, 0);
  if (existingTokens + tokenEstimate > PROJECT_SOURCES_TOKEN_BUDGET) {
    throw new Error("Project source knowledge is full. Delete a source before adding another.");
  }

  const ref = sourcesCol(db, uid, projectId).doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    name: input.name.trim(),
    mimeType: input.mimeType.trim() || "application/octet-stream",
    kind: input.kind,
    byteSize: input.byteSize,
    charCount: input.text.length,
    tokenEstimate,
    text: input.text,
    status: "ready",
    error: null,
    createdAt: now,
    updatedAt: now,
  });

  const snap = await ref.get();
  return mapSource(ref.id, snap.data() ?? {});
}

export async function deleteSource(
  uid: string,
  projectId: string,
  sourceId: string
): Promise<void> {
  const db = getAdminDb();
  await assertActiveProjectOwner(uid, projectId);
  await sourceRef(db, uid, projectId, sourceId).delete();
}
