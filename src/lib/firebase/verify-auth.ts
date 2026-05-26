import type { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function verifyRequestAuth(
  req: NextRequest
): Promise<{ uid: string; email: string | null }> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new AuthError("Missing Authorization bearer token.");
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new AuthError("Empty bearer token.");
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    throw new AuthError("Invalid or expired auth token.");
  }
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const msg = error instanceof Error ? error.message : "Authentication failed.";
  return new Response(JSON.stringify({ error: msg }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
