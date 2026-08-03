import { NextRequest } from "next/server";
import { z } from "zod";
import { runChatPipeline } from "@/lib/aria/chat-pipeline";
import { isAbortError } from "@/lib/aria/answer-pipeline";
import { parseModelRateLimitError } from "@/lib/aria/llm/rate-limit-errors";
import { getServerEnv, type ServerEnv } from "@/lib/env";
import { authErrorResponse, verifyRequestAuth } from "@/lib/firebase/verify-auth";
import { checkRateLimit } from "@/lib/rate-limit/limiter";
import { rateLimitedResponse } from "@/lib/sessions/api-response";
import { assertSessionOwner } from "@/lib/sessions/repository";
import type { AskModelId } from "@/lib/aria/models";
import type { SessionDoc } from "@/lib/sessions/types";
import { loadEntitlements } from "@/lib/plan/repository";
import { askTokensExhausted } from "@/lib/plan/entitlements";
import { PLANS } from "@/lib/plan/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Chat shares the ask engine, so the question bound matches AskBodySchema's.
const ChatBodySchema = z.object({
  sessionId: z.string().min(1),
  question: z.string().trim().min(1).max(12000),
  speaker: z.number().int().min(0).max(9).nullable().optional(),
  speakerName: z.string().trim().min(1).max(100).nullable().optional(),
});

export async function POST(req: NextRequest) {
  let env: ServerEnv;
  try {
    env = getServerEnv();
  } catch (err) {
    return jsonError(err, 500);
  }

  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(req));
  } catch (error) {
    return authErrorResponse(error);
  }

  let body;
  try {
    body = ChatBodySchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.warn(
        "[Chat] Rejected request body:",
        err.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ")
      );
    }
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [rate, sessionResult, entitlements] = await Promise.all([
    checkRateLimit(uid, { name: "chat", limit: 30, windowSeconds: 60 }),
    assertSessionOwner(uid, body.sessionId).then(
      (session) => ({ session, error: false as const }),
      () => ({ session: null, error: true as const })
    ),
    loadEntitlements(uid).catch(() => null),
  ]);

  if (!rate.allowed) {
    return rateLimitedResponse(rate.retryAfterSeconds);
  }

  if (sessionResult.error || !sessionResult.session) {
    return new Response(JSON.stringify({ error: "Session not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const session: SessionDoc = sessionResult.session;

  if (session.status === "archived") {
    return new Response(JSON.stringify({ error: "Session is archived." }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
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
    ({ textStream } = await runChatPipeline({
      uid,
      session,
      question: body.question,
      speaker: body.speaker ?? null,
      speakerName: body.speakerName ?? null,
      env,
      signal: req.signal,
      askModel,
    }));
  } catch (err) {
    if (isAbortError(err, req.signal)) {
      return new Response(null, { status: 499 });
    }
    return chatErrorResponse(err);
  }

  return new Response(textStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

function jsonError(err: unknown, status: number) {
  const msg = err instanceof Error ? err.message : "unknown error";
  return new Response(JSON.stringify({ error: `Chat failed: ${msg}` }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function chatErrorResponse(err: unknown): Response {
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

  const msg = err instanceof Error ? err.message : "Chat failed.";
  return new Response(JSON.stringify({ error: msg }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
