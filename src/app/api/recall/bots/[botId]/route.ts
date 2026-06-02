import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { setSessionBotState } from "@/lib/sessions/repository";
import { getServerEnv } from "@/lib/env";
import { MEETING_BOT_ENABLED } from "@/lib/features";
import { RecallClient, isRecallConfigured } from "@/lib/recall/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ botId: string }> };

/** Remove the bot from the call. Optionally pass ?sessionId= to mark it ended. */
export async function DELETE(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    if (!MEETING_BOT_ENABLED) {
      return jsonError("Not found.", 404);
    }

    const env = getServerEnv();
    if (!isRecallConfigured(env)) {
      return jsonError("Meeting-bot mode is not configured.", 503);
    }

    const { botId } = await context.params;
    if (!botId) return jsonError("Missing bot id.", 400);

    const recall = RecallClient.fromEnv(env);
    try {
      await recall.leaveBot(botId);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Failed to remove the bot.",
        502
      );
    }

    const sessionId = new URL(req.url).searchParams.get("sessionId");
    if (sessionId) {
      await setSessionBotState(uid, sessionId, { botStatus: "ended" }).catch(
        () => {}
      );
    }
    return jsonOk({ ok: true });
  });
}
