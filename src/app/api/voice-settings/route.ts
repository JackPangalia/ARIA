import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { loadEntitlements, setVoiceSettings } from "@/lib/plan/repository";
import { KIVO_VOICES, isKivoVoiceId } from "@/lib/audio/voices";
import type { UserPlanDoc } from "@/lib/plan/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateVoiceSettingsSchema = z.object({
  voiceId: z
    .string()
    .refine(isKivoVoiceId, "Invalid voice.")
    .nullable()
    .optional(),
});

function payload(plan: UserPlanDoc) {
  return {
    current: {
      // null = env default, which is the first curated preset.
      voiceId: plan.voiceId ?? KIVO_VOICES[0].id,
    },
    voices: KIVO_VOICES,
  };
}

export async function GET(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    const { plan } = await loadEntitlements(uid);
    return jsonOk(payload(plan));
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

    const parsed = UpdateVoiceSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid voice settings payload.", 400);
    }

    try {
      const plan = await setVoiceSettings(uid, {
        voiceId: parsed.data.voiceId,
      });
      return jsonOk(payload(plan));
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Failed to update voice settings.";
      return jsonError(msg, 400);
    }
  });
}
