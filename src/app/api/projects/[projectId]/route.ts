import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { PatchProjectSchema } from "@/lib/projects/types";
import {
  archiveProjectAndUnassignSessions,
  getProject,
  patchProject,
} from "@/lib/projects/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { projectId } = await context.params;
    const project = await getProject(uid, projectId);
    if (!project) return jsonError("Project not found.", 404);
    return jsonOk(project);
  });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { projectId } = await context.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const parsed = PatchProjectSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid project patch payload.", 400);
    }

    try {
      const project = await patchProject(uid, projectId, parsed.data);
      return jsonOk(project);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to update project.";
      return jsonError(msg, msg.includes("not found") ? 404 : 400);
    }
  });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { projectId } = await context.params;
    try {
      await archiveProjectAndUnassignSessions(uid, projectId);
      return jsonOk({ ok: true });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to archive project.";
      return jsonError(msg, msg.includes("not found") ? 404 : 400);
    }
  });
}
