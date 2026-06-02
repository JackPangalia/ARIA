import { NextRequest } from "next/server";
import { jsonOk, withAuth } from "@/lib/sessions/api-response";
import { loadEntitlements } from "@/lib/plan/repository";
import { usageSummary } from "@/lib/plan/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Powers the in-app usage meter (listening + asks bars).
export async function GET(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    const { tier, limits, usage } = await loadEntitlements(uid);
    return jsonOk(usageSummary(tier, limits, usage));
  });
}
