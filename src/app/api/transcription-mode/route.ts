import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import {
  effectiveDefaultTranscriptionMode,
  getOrCreatePlan,
  setDefaultTranscriptionMode,
} from "@/lib/plan/repository";
import { TranscriptionModeSchema } from "@/lib/sessions/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateTranscriptionModeSchema = z.object({
  defaultTranscriptionMode: TranscriptionModeSchema,
});

function payloadForPlan(plan: Awaited<ReturnType<typeof getOrCreatePlan>>) {
  const effectiveTranscriptionMode = effectiveDefaultTranscriptionMode(
    plan.tier,
    plan.defaultTranscriptionMode
  );
  return {
    tier: plan.tier,
    defaultTranscriptionMode: plan.defaultTranscriptionMode ?? "speaker",
    effectiveTranscriptionMode,
    speakerModeLocked: plan.tier === "free",
  };
}

export async function GET(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    const plan = await getOrCreatePlan(uid);
    return jsonOk(payloadForPlan(plan));
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

    const parsed = UpdateTranscriptionModeSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid transcription mode payload.", 400);
    }

    try {
      const plan = await setDefaultTranscriptionMode(
        uid,
        parsed.data.defaultTranscriptionMode
      );
      return jsonOk(payloadForPlan(plan));
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Failed to update transcription mode.";
      return jsonError(msg, msg.includes("Upgrade") ? 403 : 400);
    }
  });
}
