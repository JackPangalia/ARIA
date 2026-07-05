import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { loadEntitlements, setSpeakChatAnswers } from "@/lib/plan/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateChatSettingsSchema = z.object({
  speakChatAnswers: z.boolean(),
});

function payload(speakChatAnswers: boolean) {
  return { speakChatAnswers };
}

export async function GET(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    const { plan } = await loadEntitlements(uid);
    return jsonOk(payload(Boolean(plan.speakChatAnswers)));
  });
}

export async function PATCH(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const parsed = UpdateChatSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid chat settings payload.", 400);
    }

    try {
      const plan = await setSpeakChatAnswers(uid, parsed.data.speakChatAnswers);
      return jsonOk(payload(Boolean(plan.speakChatAnswers)));
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to update chat settings.";
      return jsonError(msg, 400);
    }
  });
}
