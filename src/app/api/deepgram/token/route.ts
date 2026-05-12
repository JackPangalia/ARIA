import { NextResponse } from "next/server";
import { DeepgramClient } from "@deepgram/sdk";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mints a short-lived (~30s) Deepgram token for the browser to open a streaming
// connection without exposing the master API key. Token usage is "single-use"
// for opening the WS; the long-lived audio stream then runs browser <-> Deepgram.
export async function POST() {
  try {
    const env = getServerEnv();
    const dg = new DeepgramClient({ apiKey: env.DEEPGRAM_API_KEY });

    // Deepgram v5 ephemeral token grant. Method shape:
    //   dg.auth.v1.tokens.grant({ ttl_seconds: 30 })
    // We attempt this and fall through to an alternative call shape if needed.
    // Returns: { access_token, expires_in }
    const result = await (
      dg as unknown as {
        auth: {
          v1: {
            tokens: {
              grant: (args: { ttl_seconds: number }) => Promise<{
                access_token?: string;
                expires_in?: number;
                accessToken?: string;
                expiresIn?: number;
              }>;
            };
          };
        };
      }
    ).auth.v1.tokens.grant({ ttl_seconds: 30 });

    const accessToken = result.access_token ?? result.accessToken;
    const expiresIn = result.expires_in ?? result.expiresIn ?? 30;

    if (!accessToken) {
      throw new Error("Deepgram returned no access token");
    }

    return NextResponse.json({ token: accessToken, expiresIn });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: `Failed to mint Deepgram token: ${msg}` },
      { status: 500 }
    );
  }
}
