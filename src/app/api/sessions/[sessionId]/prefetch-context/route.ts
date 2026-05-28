import { NextRequest } from "next/server";
import { buildContextBundle } from "@/lib/aria/context/build-context";
import { storePrefetchedContext } from "@/lib/sessions/context-prefetch-cache";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { assertSessionOwner } from "@/lib/sessions/repository";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  question: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await ctx.params;

  return withAuth(req, async ({ uid }) => {
    let body: z.infer<typeof BodySchema>;
    try {
      body = BodySchema.parse(await req.json());
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    try {
      const session = await assertSessionOwner(uid, sessionId);
      const bundle = await buildContextBundle({
        uid,
        session,
        question: body.question,
      });
      storePrefetchedContext(sessionId, body.question, bundle);
      return jsonOk({ ok: true });
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Prefetch failed.",
        500
      );
    }
  });
}
