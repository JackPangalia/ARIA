import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { generateEnhancedNotes } from "@/lib/notes/enhance";
import { saveEnhancedNotes } from "@/lib/notes/repository";
import {
  EnhancedNotesBusyError,
  EnhancedNotesEditedError,
  GenerateEnhancedNotesSchema,
  NotesRevisionConflictError,
  SaveNotesSchema,
} from "@/lib/notes/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ sessionId: string }> };

function conflict(code: string, message: string, current: unknown) {
  return new Response(JSON.stringify({ error: message, code, current }), {
    status: 409,
    headers: { "Content-Type": "application/json" },
  });
}

/** Generate (or regenerate) the enhanced notes from transcript + personal notes. */
export async function POST(req: NextRequest, context: RouteContext) {
  return withAuth(
    req,
    async ({ uid }) => {
      const { sessionId } = await context.params;
      let force = false;
      try {
        const text = await req.text();
        if (text) {
          const parsed = GenerateEnhancedNotesSchema.safeParse(JSON.parse(text));
          if (!parsed.success) return jsonError("Invalid request body.", 400);
          force = Boolean(parsed.data.force);
        }
      } catch {
        return jsonError("Invalid JSON body.", 400);
      }
      try {
        const enhanced = await generateEnhancedNotes(uid, sessionId, { force });
        return jsonOk({ enhanced });
      } catch (error) {
        if (error instanceof EnhancedNotesEditedError) {
          return conflict("edited", error.message, error.current);
        }
        if (error instanceof EnhancedNotesBusyError) {
          return conflict("generating", error.message, error.current);
        }
        const msg =
          error instanceof Error ? error.message : "Failed to write enhanced notes.";
        return jsonError(msg, msg.includes("not found") ? 404 : 500);
      }
    },
    { rateLimit: { name: "notes-enhance", limit: 10, windowSeconds: 60 } }
  );
}

/** Save a manual edit to the enhanced notes. */
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
      if (!parsed.success) return jsonError("Invalid notes payload.", 400);
      try {
        const doc = await saveEnhancedNotes(uid, sessionId, parsed.data);
        return jsonOk(doc);
      } catch (error) {
        if (error instanceof NotesRevisionConflictError) {
          return conflict("revision_conflict", error.message, error.current);
        }
        const msg = error instanceof Error ? error.message : "Failed to save notes.";
        return jsonError(msg, msg.includes("not found") ? 404 : 400);
      }
    },
    { rateLimit: { name: "notes-save", limit: 120, windowSeconds: 60 } }
  );
}
