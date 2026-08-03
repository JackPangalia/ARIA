import { NextRequest } from "next/server";
import { completeOnboarding, getOrCreatePlan } from "@/lib/plan/repository";
import { userHasAnySession } from "@/lib/sessions/repository";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function onboardingNeeded(uid: string): Promise<boolean> {
  const [plan, hasSession] = await Promise.all([
    getOrCreatePlan(uid),
    userHasAnySession(uid),
  ]);
  return !plan.onboardingCompletedAt && !hasSession;
}

export async function GET(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    const needed = await onboardingNeeded(uid);
    return jsonOk({ needed });
  });
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
