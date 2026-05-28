import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { isComposioConfigured } from "@/lib/composio/client";
import {
  deleteConnection,
  initiateConnection,
  isSupportedToolkit,
  listConnectionsForUser,
} from "@/lib/composio/connections";
import { invalidateComposioToolsCache } from "@/lib/composio/tools-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    if (!isComposioConfigured()) return jsonOk({ connections: [] });
    try {
      const connections = await listConnectionsForUser(uid);
      return jsonOk({ connections });
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Failed to list connections.",
        500
      );
    }
  });
}

export async function POST(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    if (!isComposioConfigured()) {
      return jsonError("Composio is not configured on the server.", 503);
    }
    let body: { toolkit?: string; callbackUrl?: string };
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }
    const toolkit = body.toolkit?.trim();
    if (!toolkit || !isSupportedToolkit(toolkit)) {
      return jsonError(`Unsupported toolkit: ${toolkit ?? "(missing)"}`, 400);
    }
    try {
      const result = await initiateConnection(uid, toolkit, body.callbackUrl);
      return jsonOk(result, 201);
    } catch (error) {
      return jsonError(
        error instanceof Error
          ? error.message
          : "Failed to initiate connection.",
        500
      );
    }
  });
}

export async function DELETE(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    if (!isComposioConfigured()) {
      return jsonError("Composio is not configured on the server.", 503);
    }
    const id = new URL(req.url).searchParams.get("id")?.trim();
    if (!id) return jsonError("Missing connection id.", 400);
    try {
      await deleteConnection(id);
      invalidateComposioToolsCache(uid);
      return jsonOk({ ok: true });
    } catch (error) {
      return jsonError(
        error instanceof Error
          ? error.message
          : "Failed to delete connection.",
        500
      );
    }
  });
}
