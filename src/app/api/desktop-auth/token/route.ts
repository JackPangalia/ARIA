import { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mint a Firebase custom token so the desktop shell can sign in via kivo://auth. */
export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async ({ uid }) => {
      try {
        const token = await getAdminAuth().createCustomToken(uid);
        return jsonOk({ token });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Failed to create desktop token.";
        return jsonError(msg, 500);
      }
    },
    {
      rateLimit: {
        name: "desktop-auth-token",
        limit: 10,
        windowSeconds: 60,
      },
    }
  );
}
