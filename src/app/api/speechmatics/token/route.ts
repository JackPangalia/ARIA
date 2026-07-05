import { NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { loadEntitlements } from "@/lib/plan/repository";
import { remainingListeningSeconds } from "@/lib/plan/entitlements";
import { PLANS } from "@/lib/plan/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REALTIME_TOKEN_TTL_SECONDS = 600;

export async function POST(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    // Listening quota gate: refuse to mint a token (start OR reconnect) when the
    // user has no listening budget left this period.
    const { tier, limits, usage } = await loadEntitlements(uid);
    if (remainingListeningSeconds(limits, usage) <= 0) {
      return new Response(
        JSON.stringify({
          error: `You've used all your ${PLANS[tier].display.name} listening time this month. Upgrade to keep listening.`,
          code: "listening_quota_exhausted",
        }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      );
    }

    let env;
    try {
      env = getServerEnv();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Invalid environment.";
      return jsonError(msg, 500);
    }

    const res = await fetch("https://mp.speechmatics.com/v1/api_keys?type=rt", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SPEECHMATICS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: REALTIME_TOKEN_TTL_SECONDS }),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return jsonError(
        `Failed to mint Speechmatics token (${res.status}): ${body}`,
        502
      );
    }

    const data = (await res.json()) as {
      key_value?: string;
    };

    if (!data.key_value) {
      return jsonError("Speechmatics returned no temporary key.", 502);
    }

    return jsonOk({
      token: data.key_value,
      expiresIn: REALTIME_TOKEN_TTL_SECONDS,
      // Both browser and iOS build the wss URL from this. Temporary keys are
      // valid in either region; "us" is ~100ms less round trip for NA users.
      region: env.SPEECHMATICS_RT_REGION,
    });
  }, { rateLimit: { name: "stt_token", limit: 10, windowSeconds: 60 } });
}
