import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { generateMeetingSummary } from "@/lib/aria/context/meeting-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ sessionId: string }> };

// Called once a session stops. Generates (or regenerates) the human-readable
// meeting summary shown in the Overview tab from the full transcript.
export async function POST(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { sessionId } = await context.params;
    try {
      const summary = await generateMeetingSummary(uid, sessionId);
      return jsonOk({ summary });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to generate summary.";
      return jsonError(msg, msg.includes("not found") ? 404 : 500);
    }
  });
}
