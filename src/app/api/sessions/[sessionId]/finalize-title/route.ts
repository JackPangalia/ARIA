import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { assertSessionOwner } from "@/lib/sessions/repository";
import { autoTitleSession } from "@/lib/aria/context/auto-title";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ sessionId: string }> };

// Called when a session ends (stop / switch away / tab close). Regenerates the
// sidebar title from the whole conversation so it reflects what was actually
// discussed rather than the opening line.
export async function POST(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { sessionId } = await context.params;
    try {
      await assertSessionOwner(uid, sessionId);
      const title = await autoTitleSession(uid, sessionId, {
        source: "finalize",
      });
      return jsonOk({ title });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to finalize title.";
      return jsonError(msg, msg.includes("not found") ? 404 : 400);
    }
  });
}
