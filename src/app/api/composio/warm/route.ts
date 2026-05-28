import { NextRequest } from "next/server";
import { isComposioConfigured } from "@/lib/composio/client";
import { warmComposioToolsCache } from "@/lib/composio/tools-cache";
import { isAskPipelineLoggingEnabled } from "@/lib/server/ask-pipeline-log";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    if (!isComposioConfigured()) {
      return jsonOk({ ok: true });
    }
    try {
      const t0 = performance.now();
      await warmComposioToolsCache(uid);
      if (isAskPipelineLoggingEnabled()) {
        console.log(
          `[ARIA] warm │ ${uid.slice(0, 8)}… │ catalog │ ${Math.round(performance.now() - t0)}ms`
        );
      }
      return jsonOk({ ok: true });
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Failed to warm Composio tools.",
        500
      );
    }
  });
}
