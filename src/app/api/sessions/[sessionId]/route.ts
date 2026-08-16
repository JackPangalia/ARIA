import { NextRequest } from "next/server";
import { PatchSessionSchema } from "@/lib/sessions/types";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import {
  deleteSession,
  getSessionDetail,
  patchSession,
} from "@/lib/sessions/repository";
import { loadEntitlements } from "@/lib/plan/repository";
import { historyCutoffIso } from "@/lib/plan/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { sessionId } = await context.params;
    const detail = await getSessionDetail(uid, sessionId);
    if (!detail) {
      return jsonError("Conversation not found.", 404);
    }
    // Plan history retention: hide (never delete) sessions past the window.
    const { limits } = await loadEntitlements(uid);
    const cutoff = historyCutoffIso(limits, new Date());
    if (cutoff && detail.session.updatedAt < cutoff) {
      return jsonError("Conversation not found.", 404);
    }
    return jsonOk(detail);
  });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { sessionId } = await context.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const parsed = PatchSessionSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid conversation patch payload.", 400);
    }

    try {
      const session = await patchSession(uid, sessionId, parsed.data);
      return jsonOk(session);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Update failed.";
      return jsonError(msg, msg.includes("not found") ? 404 : 400);
    }
  });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { sessionId } = await context.params;
    try {
      await deleteSession(uid, sessionId);
      return jsonOk({ deleted: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Delete failed.";
      return jsonError(msg, msg.includes("not found") ? 404 : 400);
    }
  });
}
