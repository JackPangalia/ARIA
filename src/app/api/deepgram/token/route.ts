import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mints a short-lived Deepgram JWT for the browser to open a streaming
// connection without exposing the master API key.
export async function POST() {
  try {
    const env = getServerEnv();

    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 30 }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Deepgram grant HTTP ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    if (!data.access_token) {
      throw new Error("Deepgram returned no access token");
    }

    return NextResponse.json({
      token: data.access_token,
      expiresIn: data.expires_in ?? 30,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: `Failed to mint Deepgram token: ${msg}` },
      { status: 500 }
    );
  }
}
