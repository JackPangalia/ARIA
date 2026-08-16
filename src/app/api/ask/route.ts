import { NextRequest } from "next/server";
import { z } from "zod";
import {
  isAbortError,
  runAnswerPipeline,
} from "@/lib/aria/answer-pipeline";
import {
  CARTESIA_PCM_ENCODING,
  CARTESIA_PCM_SAMPLE_RATE,
  normalizeCartesiaSampleRate,
} from "@/lib/audio/cartesia-ws";
import { startAskPipeline } from "@/lib/server/ask-pipeline-log";
import { parseModelRateLimitError } from "@/lib/aria/llm/rate-limit-errors";
import { getServerEnv, type ServerEnv } from "@/lib/env";
import { AskBodySchema } from "@/lib/sessions/types";
import { authErrorResponse, verifyRequestAuth } from "@/lib/firebase/verify-auth";
import { checkRateLimit } from "@/lib/rate-limit/limiter";
import { rateLimitedResponse } from "@/lib/sessions/api-response";
import { assertSessionOwner } from "@/lib/sessions/repository";
import type { SessionDoc } from "@/lib/sessions/types";
import { loadEntitlements } from "@/lib/plan/repository";
import { askTokensExhausted } from "@/lib/plan/entitlements";
import { PLANS } from "@/lib/plan/tiers";
import type { AskModelId } from "@/lib/aria/models";

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
  } catch (err) {
    // A 400 here means Kivo heard a whole question and then refused it — that
    // must never be silent. Name the failing field(s) in the server log.
    if (err instanceof z.ZodError) {
      console.warn(
        "[Ask] Rejected request body:",
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

  // A speculative ask is fired before the endpoint is confirmed to pre-warm the
  // LLM/TTS; it plays only if the client later adopts it, and is otherwise
  // discarded. It must not persist a phantom question turn or burn rate-limit
  // budget on a pre-warm that never becomes an answer.
  const speculative = req.headers.get("x-kivo-speculative") === "1";

  // The three pre-ask reads (rate limit, session ownership, entitlements) hit
  // independent documents — run them concurrently; every ms here is dead air
  // between the user going silent and Kivo starting to speak. Outcomes are
  // still evaluated in the original precedence order below.
  const [rate, sessionResult, entitlements] = await Promise.all([
    // Asks drive the LLM + TTS spend — the ask-token quota is a soft, fail-open
    // backstop, so this hard per-minute cap is what bounds a runaway client.
    // Speculative asks check the ceiling but don't consume it (see below).
    checkRateLimit(uid, {
      name: "ask",
      limit: 20,
      windowSeconds: 60,
      consume: !speculative,
    }),
    assertSessionOwner(uid, body.sessionId).then(
      (session) => ({ session, error: false as const }),
      () => ({ session: null, error: true as const })
    ),
    // Entitlement read failure must never block answering — fail open (default model).
    loadEntitlements(uid).catch(() => null),
  ]);

  if (!rate.allowed) {
    return rateLimitedResponse(rate.retryAfterSeconds);
  }

  if (sessionResult.error || !sessionResult.session) {
    return new Response(JSON.stringify({ error: "Conversation not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const session: SessionDoc = sessionResult.session;

  if (session.status === "archived") {
    return new Response(JSON.stringify({ error: "Conversation is archived." }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Asks are a soft backstop: only blocked once fully over the generous budget.
  let askModel: AskModelId | undefined;
  let voice: { voiceId: string | null } | undefined;
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
    voice = { voiceId: plan.voiceId ?? null };
  }

  const pipeline = startAskPipeline(
    body.sessionId,
    body.question,
    body.turnId ?? null
  );
  pipeline.stage("session.ok", {
    status: session.status,
    setupMs: Math.round(performance.now() - requestStart),
  });

  // Native clients (iOS) ask for length-prefixed MP3 segments so they can play
  // each sentence with AVAudioPlayer as it arrives. Browsers that can schedule
  // raw PCM through Web Audio advertise it with `x-kivo-audio: pcm` and get the
  // single-context WebSocket synthesis (seamless prosody); everyone else keeps
  // the `audio/mpeg` MediaSource stream unchanged.
  const framed = req.headers.get("x-kivo-stream") === "framed";
  const pcmAudio = req.headers.get("x-kivo-audio") === "pcm";
  // PCM clients may additionally ask for the answer text muxed into the
  // stream (echo discrimination + live captions in the browser engine).
  const muxText = req.headers.get("x-kivo-mux") === "text";
  const requestedSampleRate = Number(req.headers.get("x-kivo-sample-rate"));
  const pcmSampleRate = normalizeCartesiaSampleRate(requestedSampleRate);

  let audioStream: ReadableStream<Uint8Array>;
  let audioFormat: "mp3" | "pcm";
  let muxed: boolean;
  let responseSampleRate: number | null;
  let pcmEncoding: typeof CARTESIA_PCM_ENCODING | null;
  let ttsTransport: "cartesia-ws" | "cartesia-http";
  let ttsFallbackReason: string | null;
  let requestedModel: string;
  let effectiveModel: string;
  try {
    ({
      audioStream,
      audioFormat,
      muxed,
      pcmSampleRate: responseSampleRate,
      pcmEncoding,
      ttsTransport,
      ttsFallbackReason,
      requestedModel,
      effectiveModel,
    } = await runAnswerPipeline({
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
      speculative,
      framed,
      pcmAudio,
      muxText,
      pcmSampleRate,
      turnId: body.turnId ?? null,
      askModel,
      voice,
    }));
  } catch (err) {
    if (isAbortError(err, req.signal)) {
      return new Response(null, { status: 499 });
    }
    return askErrorResponse(err);
  }

  return new Response(audioStream, {
    headers: {
      "Content-Type":
        audioFormat === "pcm"
          ? muxed
            ? "application/x-kivo-pcm-mux"
            : "application/x-kivo-pcm"
          : framed
            ? "application/x-kivo-audio-frames"
            : "audio/mpeg",
      ...(audioFormat === "pcm"
        ? {
            "X-Kivo-Sample-Rate": String(
              responseSampleRate ?? CARTESIA_PCM_SAMPLE_RATE
            ),
            "X-Kivo-Encoding": pcmEncoding ?? CARTESIA_PCM_ENCODING,
          }
        : {}),
      "X-Kivo-Model": effectiveModel,
      "X-Kivo-Requested-Model": requestedModel,
      "X-Kivo-TTS-Transport": ttsTransport,
      ...(ttsFallbackReason
        ? { "X-Kivo-TTS-Fallback": encodeURIComponent(ttsFallbackReason) }
        : {}),
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
  const quota = parseModelRateLimitError(err);
  if (quota) {
    return new Response(
      JSON.stringify({
        error: quota.message,
        code: "model_rate_limited",
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
