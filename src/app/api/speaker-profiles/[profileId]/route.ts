import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import {
  deleteSpeakerProfile,
  patchSpeakerProfile,
} from "@/lib/speakers/repository";
import { PatchSpeakerProfileSchema } from "@/lib/speakers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ profileId: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { profileId } = await context.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const parsed = PatchSpeakerProfileSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid speaker profile patch.", 400);
    }

    try {
      const profile = await patchSpeakerProfile(uid, profileId, parsed.data);
      return jsonOk(profile);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to update profile.";
      return jsonError(msg, msg.includes("not found") ? 404 : 400);
    }
  });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { profileId } = await context.params;
    await deleteSpeakerProfile(uid, profileId);
    return jsonOk({ ok: true });
  });
}
