import { NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REALTIME_TOKEN_TTL_SECONDS = 600;

export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
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
      region: "eu",
    });
  });
}
