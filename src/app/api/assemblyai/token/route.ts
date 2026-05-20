import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mints a short-lived AssemblyAI streaming token for the browser to open a
// WebSocket without exposing the master API key. Single-use per session open;
// audio then streams browser <-> AssemblyAI.
export async function POST() {
  try {
    const env = getServerEnv();
    const url = new URL("https://streaming.assemblyai.com/v3/token");
    url.searchParams.set("expires_in_seconds", "60");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: env.ASSEMBLYAI_API_KEY,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AssemblyAI token HTTP ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      token?: string;
      expires_in_seconds?: number;
    };

    if (!data.token) {
      throw new Error("AssemblyAI returned no token");
    }

    return NextResponse.json({
      token: data.token,
      expiresIn: data.expires_in_seconds ?? 60,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: `Failed to mint AssemblyAI token: ${msg}` },
      { status: 500 }
    );
  }
}
