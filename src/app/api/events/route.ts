import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { AnalyticsEventSchema } from "@/lib/analytics/events";
import { checkRateLimit, requestIpKey } from "@/lib/rate-limit/limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * First-party analytics sink. Unauthenticated by design (landing-page views
 * happen before sign-in), so it trusts nothing: strict event-name allowlist,
 * size-capped fields, and a per-anon/IP rate limit. Never fails loudly — a
 * broken analytics write must not surface to the user.
 */
export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = AnalyticsEventSchema.safeParse(await req.json());
  } catch {
    return new Response(null, { status: 204 });
  }
  if (!parsed.success) {
    return new Response(null, { status: 204 });
  }

  const event = parsed.data;
  const rate = await checkRateLimit(event.anonId || requestIpKey(req), {
    name: "events",
    limit: 60,
    windowSeconds: 60,
  });
  if (!rate.allowed) {
    return new Response(null, { status: 204 });
  }

  try {
    await getAdminDb()
      .collection("events")
      .add({
        name: event.name,
        anonId: event.anonId,
        uid: event.uid ?? null,
        props: event.props ?? {},
        ts: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.error("[events] write failed:", err);
  }

  return new Response(null, { status: 204 });
}
