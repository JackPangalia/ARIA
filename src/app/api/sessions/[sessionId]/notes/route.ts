import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { getSessionNotes, savePersonalNotes } from "@/lib/notes/repository";
import { NotesRevisionConflictError, SaveNotesSchema } from "@/lib/notes/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ sessionId: string }> };

/** Both notes documents for a session (empty placeholders when unset). */
export async function GET(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { sessionId } = await context.params;
    try {
      return jsonOk(await getSessionNotes(uid, sessionId));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load notes.";
      return jsonError(msg, msg.includes("not found") ? 404 : 500);
    }
  });
}

/** Save the owner's personal notes. 409 with the current doc if the base revision is stale. */
export async function PUT(req: NextRequest, context: RouteContext) {
  return withAuth(
    req,
    async ({ uid }) => {
      const { sessionId } = await context.params;
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonError("Invalid JSON body.", 400);
      }
      const parsed = SaveNotesSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError("Invalid notes payload.", 400);
      }
      try {
        const doc = await savePersonalNotes(uid, sessionId, parsed.data);
        return jsonOk(doc);
      } catch (error) {
        if (error instanceof NotesRevisionConflictError) {
          return new Response(
            JSON.stringify({
              error: error.message,
              code: "revision_conflict",
              current: error.current,
            }),
            { status: 409, headers: { "Content-Type": "application/json" } }
          );
        }
        const msg = error instanceof Error ? error.message : "Failed to save notes.";
        return jsonError(msg, msg.includes("not found") ? 404 : 400);
      }
    },
    { rateLimit: { name: "notes-save", limit: 120, windowSeconds: 60 } }
  );
}
