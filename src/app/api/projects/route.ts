import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import {
  CreateProjectSchema,
  ListProjectsSchema,
} from "@/lib/projects/types";
import { createProject, listProjects } from "@/lib/projects/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = ListProjectsSchema.safeParse(params);
    if (!parsed.success) {
      return jsonError("Invalid query parameters.", 400);
    }

    const projects = await listProjects(uid, parsed.data);
    return jsonOk({ projects });
  });
}

export async function POST(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const parsed = CreateProjectSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid project payload.", 400);
    }

    try {
      const project = await createProject(uid, parsed.data);
      return jsonOk(project, 201);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to create project.";
      return jsonError(msg, 400);
    }
  });
}
