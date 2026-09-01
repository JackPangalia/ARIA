import { NextRequest } from "next/server";
import {
  CreateSessionSchema,
  ListSessionsSchema,
} from "@/lib/sessions/types";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { createSession, listSessions } from "@/lib/sessions/repository";
import {
  effectiveDefaultTranscriptionMode,
  loadEntitlements,
} from "@/lib/plan/repository";
import { historyCutoffIso } from "@/lib/plan/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = ListSessionsSchema.safeParse(params);
    if (!parsed.success) {
      return jsonError("Invalid query parameters.", 400);
    }

    const { limits } = await loadEntitlements(uid);
    const since = historyCutoffIso(limits, new Date());
    const sessions = await listSessions(uid, { ...parsed.data, since });
    return jsonOk({ sessions });
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

    const parsed = CreateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid conversation payload.", 400);
    }

    const session = await createSession(uid, {
      ...parsed.data,
      speakerCount: parsed.data.speakerCount ?? 2,
      transcriptionMode: "speaker",
    });
    return jsonOk(session, 201);
  }, { rateLimit: { name: "session_write", limit: 60, windowSeconds: 60 } });
}
