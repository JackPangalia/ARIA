import { NextRequest } from "next/server";
import { z } from "zod";
import { isAbortError } from "@/lib/aria/answer-pipeline";
import { parseModelRateLimitError } from "@/lib/aria/llm/rate-limit-errors";
import type { AskModelId } from "@/lib/aria/models";
import { getServerEnv, type ServerEnv } from "@/lib/env";
import { authErrorResponse, verifyRequestAuth } from "@/lib/firebase/verify-auth";
import { askTokensExhausted } from "@/lib/plan/entitlements";
import { loadEntitlements } from "@/lib/plan/repository";
import { PLANS } from "@/lib/plan/tiers";
import { runPrivateChatPipeline } from "@/lib/private-chat/pipeline";
import { listPrivateChatMessages } from "@/lib/private-chat/repository";
import { PrivateChatBodySchema } from "@/lib/private-chat/types";
import { checkRateLimit } from "@/lib/rate-limit/limiter";
import {
  jsonError,
  jsonOk,
  rateLimitedResponse,
  withAuth,
} from "@/lib/sessions/api-response";
import { assertSessionOwner } from "@/lib/sessions/repository";
import type { SessionDoc } from "@/lib/sessions/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ sessionId: string }> };

/** The private chat's own history, oldest first. */
export async function GET(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { sessionId } = await context.params;
    try {
      await assertSessionOwner(uid, sessionId);
      const messages = await listPrivateChatMessages(uid, sessionId);
      return jsonOk({ messages });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load chat.";
      return jsonError(msg, msg.includes("not found") ? 404 : 500);
    }
  });
}

/** Ask Kivo privately; the written answer streams back as plain text. */
export async function POST(req: NextRequest, context: RouteContext) {
  let env: ServerEnv;
  try {
    env = getServerEnv();
  } catch (err) {
    return jsonError(`Chat failed: ${err instanceof Error ? err.message : "unknown error"}`, 500);
  }

  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(req));
  } catch (error) {
    return authErrorResponse(error);
  }

  const { sessionId } = await context.params;

  let body: z.infer<typeof PrivateChatBodySchema>;
  try {
    body = PrivateChatBodySchema.parse(await req.json());
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const [rate, sessionResult, entitlements] = await Promise.all([
    checkRateLimit(uid, { name: "private-chat", limit: 30, windowSeconds: 60 }),
    assertSessionOwner(uid, sessionId).then(
      (session) => ({ session, error: false as const }),
      () => ({ session: null, error: true as const })
    ),
    loadEntitlements(uid).catch(() => null),
  ]);

  if (!rate.allowed) return rateLimitedResponse(rate.retryAfterSeconds);
  if (sessionResult.error || !sessionResult.session) {
    return jsonError("Conversation not found.", 404);
  }
  const session: SessionDoc = sessionResult.session;
  if (session.status === "archived") {
    return jsonError("Conversation is archived.", 409);
  }

  let askModel: AskModelId | undefined;
  if (entitlements) {
    const { tier, limits, usage, plan } = entitlements;
    if (askTokensExhausted(limits, usage)) {
      return new Response(
        JSON.stringify({
          error: `You've reached your ${PLANS[tier].display.name} ask limit this month. Upgrade for more.`,
          code: "ask_quota_exhausted",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    askModel = plan.answerModel ?? undefined;
  }

  let textStream: ReadableStream<Uint8Array>;
  try {
    ({ textStream } = await runPrivateChatPipeline({
      uid,
      session,
      question: body.question,
      env,
      signal: req.signal,
      askModel,
    }));
  } catch (err) {
    if (isAbortError(err, req.signal)) return new Response(null, { status: 499 });
    const quota = parseModelRateLimitError(err);
    if (quota) {
      return new Response(
        JSON.stringify({
          error: quota.message,
          code: "model_rate_limited",
          retryAfterSeconds: quota.retryAfterSeconds ?? null,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    return jsonError(err instanceof Error ? err.message : "Chat failed.", 500);
  }

  return new Response(textStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
