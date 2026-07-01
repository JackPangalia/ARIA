import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { deleteSource } from "@/lib/projects/sources-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ projectId: string; sourceId: string }> };

export async function DELETE(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { projectId, sourceId } = await context.params;
    try {
      await deleteSource(uid, projectId, sourceId);
      return jsonOk({ ok: true });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to delete project source.";
      return jsonError(msg, msg.includes("not found") ? 404 : 400);
    }
  });
}
