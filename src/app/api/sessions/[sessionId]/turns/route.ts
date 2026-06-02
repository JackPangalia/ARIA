import { NextRequest } from "next/server";
import { CreateTurnSchema } from "@/lib/sessions/types";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { appendTurn, assertSessionOwner } from "@/lib/sessions/repository";

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
  });
}
