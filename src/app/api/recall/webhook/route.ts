import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/sessions/api-response";
import { setSessionBotState } from "@/lib/sessions/repository";
import { getServerEnv } from "@/lib/env";
import type { BotStatus } from "@/lib/sessions/types";
import { MEETING_BOT_ENABLED } from "@/lib/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recall delivers bot lifecycle events here. NOTE: production Recall webhooks are
// signed with Svix — verify with the `svix` library against RECALL_WEBHOOK_SECRET
// for real deployments. This scaffold accepts a shared-secret header/query as a
// minimal guard so the flow is testable before Svix is wired in.

type AnyRecord = Record<string, unknown>;
function asRecord(v: unknown): AnyRecord | null {
  return v && typeof v === "object" ? (v as AnyRecord) : null;
}

/** Map Recall status codes to our coarse BotStatus. */
function mapBotStatus(code: string): BotStatus | null {
  switch (code) {
    case "joining_call":
    case "in_waiting_room":
      return "joining";
    case "in_call_recording":
    case "in_call_not_recording":
      return "live";
    case "call_ended":
    case "done":
      return "ended";
    case "fatal":
    case "error":
      return "error";
    default:
      return null;
  }
}

function verifySecret(req: NextRequest, secret: string): boolean {
  const header =
    req.headers.get("x-recall-secret") ??
    new URL(req.url).searchParams.get("secret");
  return header === secret;
}

export async function POST(req: NextRequest) {
  if (!MEETING_BOT_ENABLED) {
    return jsonError("Not found.", 404);
  }

  const env = getServerEnv();
  if (!env.RECALL_API_KEY) return jsonError("Meeting-bot mode is not configured.", 503);
  if (env.RECALL_WEBHOOK_SECRET && !verifySecret(req, env.RECALL_WEBHOOK_SECRET)) {
    return jsonError("Invalid webhook signature.", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const root = asRecord(body);
  const data = asRecord(root?.data);
  // metadata is echoed from createBot; it carries our uid + sessionId.
  const metadata =
    asRecord(data?.metadata) ?? asRecord(asRecord(data?.bot)?.metadata);
  const uid = typeof metadata?.uid === "string" ? metadata.uid : null;
  const sessionId =
    typeof metadata?.sessionId === "string" ? metadata.sessionId : null;

  const statusRec = asRecord(data?.status);
  const code =
    (typeof statusRec?.code === "string" && statusRec.code) ||
    (typeof data?.status === "string" ? (data.status as string) : "");
  const botStatus = code ? mapBotStatus(code) : null;

  if (uid && sessionId && botStatus) {
    await setSessionBotState(uid, sessionId, { botStatus }).catch((err) => {
      console.error("[recall-webhook] failed to update session:", err);
    });
  }

  // Always 200 so Recall doesn't retry indefinitely on unmapped events.
  return jsonOk({ ok: true });
}
