import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { summarizeSession } from "@/lib/aria/context/summarize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { sessionId } = await context.params;
    try {
      const result = await summarizeSession(uid, sessionId);
      return jsonOk(result);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Summarization failed.";
      return jsonError(msg, 500);
    }
  });
}
