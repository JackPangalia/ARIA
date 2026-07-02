import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { accrueListeningHeartbeat } from "@/lib/plan/repository";
import { HeartbeatBodySchema } from "@/lib/plan/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by the client on a fixed interval while actively listening. The server
// times the gap since the last heartbeat (capped) to accrue listening seconds and
// tells the client to stop when the listening budget is exhausted.
export async function POST(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }
    const parsed = HeartbeatBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid heartbeat payload.", 400);
    }

    const result = await accrueListeningHeartbeat(uid, parsed.data.sessionId);
    return jsonOk(result);
  }, { rateLimit: { name: "heartbeat", limit: 30, windowSeconds: 60 } });
}
