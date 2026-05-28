import { NextRequest } from "next/server";
import { deleteUserAccount } from "@/lib/firebase/delete-account";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    try {
      await deleteUserAccount(uid);
      return jsonOk({ ok: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete account.";
      return jsonError(message, 500);
    }
  });
}
