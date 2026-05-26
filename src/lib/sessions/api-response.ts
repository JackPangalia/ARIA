import { authErrorResponse, verifyRequestAuth } from "@/lib/firebase/verify-auth";

export function jsonOk<T>(data: T, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function withAuth(
  req: Request,
  handler: (ctx: { uid: string }) => Promise<Response>
): Promise<Response> {
  try {
    const { uid } = await verifyRequestAuth(req as import("next/server").NextRequest);
    return await handler({ uid });
  } catch (error) {
    return authErrorResponse(error);
  }
}
