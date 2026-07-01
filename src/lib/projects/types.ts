import { z } from "zod";

export const ProjectStatusSchema = z.enum(["active", "archived"]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export interface ProjectDoc {
  id: string;
  name: string;
  instructions: string;
  status: ProjectStatus;
  color?: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export const ProjectSourceKindSchema = z.enum([
  "text",
  "markdown",
  "pdf",
  "docx",
  "code",
  "csv",
  "json",
]);
export type ProjectSourceKind = z.infer<typeof ProjectSourceKindSchema>;

export const ProjectSourceStatusSchema = z.enum(["ready", "error"]);
export type ProjectSourceStatus = z.infer<typeof ProjectSourceStatusSchema>;

export interface ProjectSourceDoc {
  id: string;
  name: string;
  mimeType: string;
  kind: ProjectSourceKind;
  byteSize: number;
  charCount: number;
  tokenEstimate: number;
  text: string;
  status: ProjectSourceStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  instructions: z.string().trim().max(12000).default(""),
  color: z.string().trim().optional(),
  icon: z.string().trim().optional(),
});

export const PatchProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  instructions: z.string().trim().max(12000).optional(),
  status: ProjectStatusSchema.optional(),
  color: z.string().trim().optional(),
  icon: z.string().trim().optional(),
});

export const ListProjectsSchema = z.object({
  status: ProjectStatusSchema.optional(),
  includeArchived: z.coerce.boolean().default(false),
});

export const CreateProjectSourceSchema = z.object({
  name: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(1).max(180),
  kind: ProjectSourceKindSchema,
  byteSize: z.number().int().min(0).max(2_000_000),
  text: z.string().trim().min(1).max(700_000),
});
