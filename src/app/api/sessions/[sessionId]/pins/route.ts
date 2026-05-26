import { NextRequest } from "next/server";
import { CreatePinSchema } from "@/lib/sessions/types";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { createPin, deletePin } from "@/lib/sessions/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { sessionId } = await context.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const parsed = CreatePinSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid pin payload.", 400);
    }

    try {
      const pin = await createPin(uid, sessionId, parsed.data);
      return jsonOk(pin, 201);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to create pin.";
      return jsonError(msg, msg.includes("not found") ? 404 : 400);
    }
  });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { sessionId } = await context.params;
    const pinId = req.nextUrl.searchParams.get("pinId");
    if (!pinId) {
      return jsonError("Missing pinId query parameter.", 400);
    }

    try {
      await deletePin(uid, sessionId, pinId);
      return jsonOk({ ok: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to delete pin.";
      return jsonError(msg, 400);
    }
  });
}
