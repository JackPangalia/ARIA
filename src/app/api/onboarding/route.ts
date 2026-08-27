import { NextRequest } from "next/server";
import { completeOnboarding } from "@/lib/plan/repository";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withAuth(req, async () => jsonOk({ needed: false }));
}

export async function POST(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    try {
      await completeOnboarding(uid);
      return jsonOk({ completed: true });
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Failed to complete onboarding.";
      return jsonError(msg, 500);
    }
  });
}
