import { NextRequest } from "next/server";
import {
  CreateSessionSchema,
  ListSessionsSchema,
} from "@/lib/sessions/types";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { createSession, listSessions } from "@/lib/sessions/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = ListSessionsSchema.safeParse(params);
    if (!parsed.success) {
      return jsonError("Invalid query parameters.", 400);
    }

    const sessions = await listSessions(uid, parsed.data);
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
      return jsonError("Invalid session payload.", 400);
    }

    const session = await createSession(uid, parsed.data);
    return jsonOk(session, 201);
  });
}
