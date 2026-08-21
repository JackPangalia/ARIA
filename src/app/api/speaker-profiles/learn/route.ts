import { NextRequest } from "next/server";
import { canCreateSpeakerProfile } from "@/lib/plan/entitlements";
import { loadEntitlements } from "@/lib/plan/repository";
import {
  learnSpeakerProfile,
  listSpeakerProfiles,
  slugifySpeakerProfileId,
} from "@/lib/speakers/repository";
import { LearnSpeakerProfileSchema } from "@/lib/speakers/types";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async ({ uid }) => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonError("Invalid JSON body.", 400);
      }

      const parsed = LearnSpeakerProfileSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError("Invalid learned speaker payload.", 400);
      }

      const existing = await listSpeakerProfiles(uid);
      const targetId = slugifySpeakerProfileId(parsed.data.name);
      if (!existing.some((profile) => profile.id === targetId)) {
        const { limits } = await loadEntitlements(uid);
        if (!canCreateSpeakerProfile(limits, existing.length)) {
          return jsonError(
            `You've reached the limit of ${limits.maxSpeakerProfiles} speaker profiles. Delete one to add another.`,
            403
          );
        }
      }

      try {
        const profile = await learnSpeakerProfile(uid, parsed.data);
        return jsonOk(profile, 201);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to learn speaker profile.";
        return jsonError(message, 400);
      }
    },
    { rateLimit: { name: "speaker_learn", limit: 20, windowSeconds: 60 } }
  );
}
