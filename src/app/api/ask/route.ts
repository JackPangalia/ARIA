import { NextRequest } from "next/server";
import {
  isAbortError,
  runAnswerPipeline,
} from "@/lib/aria/answer-pipeline";
import { startAskPipeline } from "@/lib/server/ask-pipeline-log";
import { parseGeminiQuotaError } from "@/lib/aria/llm/gemini-errors";
import { getServerEnv, type ServerEnv } from "@/lib/env";
import { AskBodySchema } from "@/lib/sessions/types";
import { authErrorResponse, verifyRequestAuth } from "@/lib/firebase/verify-auth";
import { assertSessionOwner } from "@/lib/sessions/repository";
import type { SessionDoc } from "@/lib/sessions/types";
import { loadEntitlements } from "@/lib/plan/repository";
import { askTokensExhausted } from "@/lib/plan/entitlements";
import { PLANS } from "@/lib/plan/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const requestStart = performance.now();
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
    body = AskBodySchema.parse(await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let session: SessionDoc;
  try {
    session = await assertSessionOwner(uid, body.sessionId);
  } catch {
    return new Response(JSON.stringify({ error: "Session not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (session.status === "archived") {
    return new Response(JSON.stringify({ error: "Session is archived." }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Asks are a soft backstop: only blocked once fully over the generous budget.
  try {
    const { tier, limits, usage } = await loadEntitlements(uid);
    if (askTokensExhausted(limits, usage)) {
      return new Response(
        JSON.stringify({
          error: `You've reached your ${PLANS[tier].display.name} ask limit this month. Upgrade for more.`,
          code: "ask_quota_exhausted",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch {
    // Entitlement read failure must never block answering — fail open.
  }

  const pipeline = startAskPipeline(body.sessionId, body.question);
  pipeline.stage("session.ok", {
    status: session.status,
    setupMs: Math.round(performance.now() - requestStart),
  });

  // Native clients (iOS) ask for length-prefixed MP3 segments so they can play
  // each sentence with AVAudioPlayer as it arrives. The browser sends no such
  // header and keeps the raw `audio/mpeg` MediaSource stream unchanged.
  const framed = req.headers.get("x-kivo-stream") === "framed";

  let audioStream: ReadableStream<Uint8Array>;
  try {
    ({ audioStream } = await runAnswerPipeline({
      uid,
      session,
      question: body.question,
      speaker: body.speaker ?? null,
      speakerName: body.speakerName ?? null,
      sourceUtteranceIds: body.sourceUtteranceIds ?? [],
      env,
      signal: req.signal,
      pipeline,
      authSessionMs: performance.now() - requestStart,
      framed,
    }));
  } catch (err) {
    if (isAbortError(err, req.signal)) {
      return new Response(null, { status: 499 });
    }
    return askErrorResponse(err);
  }

  return new Response(audioStream, {
    headers: {
      "Content-Type": framed
        ? "application/x-kivo-audio-frames"
        : "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

function jsonError(err: unknown, status: number) {
  const msg = err instanceof Error ? err.message : "unknown error";
  return new Response(JSON.stringify({ error: `Ask failed: ${msg}` }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function askErrorResponse(err: unknown): Response {
  const quota = parseGeminiQuotaError(err);
  if (quota) {
    return new Response(
      JSON.stringify({
        error: quota.message,
        code: "gemini_quota_exceeded",
        retryAfterSeconds: quota.retryAfterSeconds ?? null,
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const msg = err instanceof Error ? err.message : "Ask failed.";
  return new Response(JSON.stringify({ error: msg }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
