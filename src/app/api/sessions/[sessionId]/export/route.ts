import { NextRequest } from "next/server";
import { jsonError, withAuth } from "@/lib/sessions/api-response";
import {
  exportSessionJson,
  exportSessionMarkdown,
} from "@/lib/sessions/export";
import { getSessionDetail } from "@/lib/sessions/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { sessionId } = await context.params;
    const format = req.nextUrl.searchParams.get("format") ?? "markdown";

    const detail = await getSessionDetail(uid, sessionId);
    if (!detail) {
      return jsonError("Session not found.", 404);
    }

    if (format === "json") {
      return new Response(exportSessionJson(detail), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="kivo-session-${sessionId}.json"`,
        },
      });
    }

    if (format !== "markdown") {
      return jsonError('Invalid format. Use "markdown" or "json".', 400);
    }

    return new Response(exportSessionMarkdown(detail), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="kivo-session-${sessionId}.md"`,
      },
    });
  });
}
