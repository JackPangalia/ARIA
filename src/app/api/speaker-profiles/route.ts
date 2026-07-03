import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import {
  listSpeakerProfiles,
  slugifySpeakerProfileId,
  upsertSpeakerProfile,
} from "@/lib/speakers/repository";
import { SpeakerProfileInputSchema } from "@/lib/speakers/types";
import { loadEntitlements } from "@/lib/plan/repository";
import { canCreateSpeakerProfile } from "@/lib/plan/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    const profiles = await listSpeakerProfiles(uid);
    return jsonOk({ profiles });
  });
}

export async function POST(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const parsed = SpeakerProfileInputSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid speaker profile payload.", 400);
    }

    // Tier limit applies only to NEW profiles; updating an existing one is fine.
    const existing = await listSpeakerProfiles(uid);
    const targetId = slugifySpeakerProfileId(parsed.data.name);
    const isNew = !existing.some((p) => p.id === targetId);
    if (isNew) {
      const { limits } = await loadEntitlements(uid);
      if (!canCreateSpeakerProfile(limits, existing.length)) {
        return jsonError(
          `You've reached the limit of ${limits.maxSpeakerProfiles} speaker profiles. Delete one to add another.`,
          403
        );
      }
    }

    try {
      const profile = await upsertSpeakerProfile(uid, parsed.data);
      return jsonOk(profile, 201);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to save speaker profile.";
      return jsonError(msg, 400);
    }
  });
}
