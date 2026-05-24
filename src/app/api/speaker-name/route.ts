import { NextRequest } from "next/server";
import { z } from "zod";
import { extractSpeakerName } from "@/lib/aria/speaker-name";
import { getServerEnv, type ServerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BodySchema = z.object({
  text: z.string().min(1),
  speakerId: z.number().int().nonnegative(),
});

export async function POST(req: NextRequest) {
  let env: ServerEnv;
  try {
    env = getServerEnv();
  } catch (err) {
    return jsonError(err, 500);
  }

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const name = await extractSpeakerName({
      text: body.text,
      env,
      signal: req.signal,
    });

    return new Response(
      JSON.stringify({
        assigned: Boolean(name),
        speakerId: body.speakerId,
        name,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    return jsonError(err, 500);
  }
}

function jsonError(err: unknown, status: number) {
  const msg = err instanceof Error ? err.message : "unknown error";
  return new Response(
    JSON.stringify({ error: `Speaker name failed: ${msg}` }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}
