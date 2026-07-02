import { NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit, requestIpKey } from "@/lib/rate-limit/limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ClientErrorSchema = z.object({
  message: z.string().min(1).max(500),
  stack: z.string().max(4_000).optional(),
  source: z.string().max(300).optional(),
  url: z.string().max(300).optional(),
  userAgent: z.string().max(300).optional(),
  anonId: z.string().max(64).optional(),
});

/**
 * Sink for the client error reporter. No storage — a structured console.error
 * per report lands in Vercel logs (filter on "[client-error]").
 */
export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = ClientErrorSchema.safeParse(await req.json());
  } catch {
    return new Response(null, { status: 204 });
  }
  if (!parsed.success) {
    return new Response(null, { status: 204 });
  }

  const rate = await checkRateLimit(parsed.data.anonId || requestIpKey(req), {
    name: "client_errors",
    limit: 10,
    windowSeconds: 60,
  });
  if (rate.allowed) {
    console.error("[client-error]", JSON.stringify(parsed.data));
  }

  return new Response(null, { status: 204 });
}
