import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import {
  loadEntitlements,
  setDefaultTranscriptionMode,
  type Entitlements,
} from "@/lib/plan/repository";
import { TranscriptionModeSchema } from "@/lib/sessions/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateTranscriptionModeSchema = z.object({
  defaultTranscriptionMode: TranscriptionModeSchema,
});

function payloadForEntitlements(entitlements: Entitlements) {
  const { plan, usage } = entitlements;
  return {
    tier: plan.tier,
    defaultTranscriptionMode: "speaker" as const,
    effectiveTranscriptionMode: "speaker" as const,
    speakerModeLocked: false,
    speakerSecondsUsed: usage.speakerSeconds,
    speakerSecondsCap: null,
    speakerSecondsRemaining: null,
    speakerModeExhausted: false,
  };
}

export async function GET(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    const entitlements = await loadEntitlements(uid);
    return jsonOk(payloadForEntitlements(entitlements));
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
      await setDefaultTranscriptionMode(uid, parsed.data.defaultTranscriptionMode);
      const entitlements = await loadEntitlements(uid);
      return jsonOk(payloadForEntitlements(entitlements));
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Failed to update transcription mode.";
      return jsonError(msg, 400);
    }
  });
}
