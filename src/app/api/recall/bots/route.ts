import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { CreateBotRequestSchema } from "@/lib/sessions/types";
import { assertSessionOwner, setSessionBotState } from "@/lib/sessions/repository";
import { getServerEnv } from "@/lib/env";
import { MEETING_BOT_ENABLED } from "@/lib/features";
import {
  RecallApiError,
  RecallClient,
  buildRealtimeWsUrl,
  detectMeetingPlatform,
  isRecallConfigured,
} from "@/lib/recall/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    if (!MEETING_BOT_ENABLED) {
      return jsonError("Not found.", 404);
    }

    const env = getServerEnv();
    if (!isRecallConfigured(env)) {
      return jsonError(
        "Meeting-bot mode is not configured (RECALL_API_KEY / BOT_WORKER_PUBLIC_URL).",
        503
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }
    const parsed = CreateBotRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid meeting-bot request.", 400);
    }
    const { sessionId, meetingUrl } = parsed.data;

    try {
      await assertSessionOwner(uid, sessionId);
    } catch {
      return jsonError("Conversation not found.", 404);
    }

    const recall = RecallClient.fromEnv(env);
    const realtimeWsUrl = buildRealtimeWsUrl(env.BOT_WORKER_PUBLIC_URL!, {
      sessionId,
      uid,
    });

    try {
      const { botId } = await recall.createBot({
        meetingUrl,
        realtimeWsUrl,
        metadata: { uid, sessionId },
      });

      const session = await setSessionBotState(uid, sessionId, {
        mode: "bot",
        botId,
        meetingPlatform: detectMeetingPlatform(meetingUrl),
        botStatus: "joining",
      });

      return jsonOk({ botId, session }, 201);
    } catch (error) {
      if (error instanceof RecallApiError) {
        console.error(
          `[recall] createBot failed (${error.status}):`,
          error.body
        );
      } else {
        console.error("[recall] createBot failed:", error);
      }
      const message =
        error instanceof RecallApiError
          ? `Recall rejected the bot (${error.status}).`
          : error instanceof Error
            ? error.message
            : "Failed to send the bot.";
      return jsonError(message, 502);
    }
  });
}
