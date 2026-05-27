import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import {
  listSpeakerProfiles,
  upsertSpeakerProfile,
} from "@/lib/speakers/repository";
import { SpeakerProfileInputSchema } from "@/lib/speakers/types";

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
