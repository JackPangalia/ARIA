import { NextRequest } from "next/server";
import { CreateTurnSchema, RelabelTurnsSchema } from "@/lib/sessions/types";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import {
  appendTurn,
  assertSessionOwner,
  relabelTurnSpeaker,
} from "@/lib/sessions/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { sessionId } = await context.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const parsed = CreateTurnSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid turn payload.", 400);
    }

    try {
      const session = await assertSessionOwner(uid, sessionId);
      const turn = await appendTurn(uid, sessionId, parsed.data);
      if (parsed.data.role === "speaker") {
        import("@/lib/aria/context/auto-title")
          .then(({ autoTitleSession }) => {
            void autoTitleSession(uid, sessionId, { source: "listening" });
          })
          .catch((err) =>
            console.error("[Auto-Title] failed to import:", err)
          );
      }
      return jsonOk(turn, 201);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to save turn.";
      return jsonError(msg, msg.includes("not found") ? 404 : 400);
    }
  }, { rateLimit: { name: "turn_write", limit: 60, windowSeconds: 60 } });
}

/** Bulk speaker relabel — the "that wasn't Jack" correction path. */
export async function PATCH(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { sessionId } = await context.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const parsed = RelabelTurnsSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid relabel payload.", 400);
    }

    try {
      const updated = await relabelTurnSpeaker(
        uid,
        sessionId,
        parsed.data.turnIds,
        parsed.data.speakerName
      );
      return jsonOk({ updated });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to relabel turns.";
      return jsonError(msg, msg.includes("not found") ? 404 : 400);
    }
  }, { rateLimit: { name: "turn_relabel", limit: 20, windowSeconds: 60 } });
}
