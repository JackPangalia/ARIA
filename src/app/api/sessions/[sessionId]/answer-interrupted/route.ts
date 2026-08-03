import { NextRequest } from "next/server";
import { ReportAnswerInterruptedSchema } from "@/lib/sessions/types";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { markLatestAssistantInterrupted } from "@/lib/sessions/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ sessionId: string }> };

/**
 * "Stop" arrived while an answer was playing. The client reports how far
 * playback got so the persisted assistant turn reflects what was actually
 * heard — the model must not believe it delivered words nobody listened to.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { sessionId } = await context.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const parsed = ReportAnswerInterruptedSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid interruption payload.", 400);
    }

    try {
      const result = await markLatestAssistantInterrupted(uid, sessionId, {
        playedSeconds: parsed.data.playedSeconds,
        totalSeconds: parsed.data.totalSeconds ?? null,
      });
      return jsonOk({ updated: result != null, heardChars: result?.heardChars ?? null });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to record interruption.";
      return jsonError(msg, msg.includes("not found") ? 404 : 400);
    }
  }, { rateLimit: { name: "answer_interrupt", limit: 20, windowSeconds: 60 } });
}
