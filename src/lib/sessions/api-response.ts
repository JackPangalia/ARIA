import { authErrorResponse, verifyRequestAuth } from "@/lib/firebase/verify-auth";
import { checkRateLimit, type RateLimitConfig } from "@/lib/rate-limit/limiter";

export function jsonOk<T>(data: T, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonError(
  message: string,
  status = 400,
  headers?: Record<string, string>
) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function rateLimitedResponse(retryAfterSeconds: number) {
  return jsonError("Too many requests — slow down and try again.", 429, {
    "Retry-After": String(retryAfterSeconds),
  });
}

export interface WithAuthOptions {
  /** Per-uid fixed-window rate limit applied after auth succeeds. */
  rateLimit?: RateLimitConfig;
}

export async function withAuth(
  req: Request,
  handler: (ctx: { uid: string; email: string | null }) => Promise<Response>,
  options?: WithAuthOptions
): Promise<Response> {
  try {
    const { uid, email } = await verifyRequestAuth(req as import("next/server").NextRequest);
    if (options?.rateLimit) {
      const result = await checkRateLimit(uid, options.rateLimit);
      if (!result.allowed) {
        return rateLimitedResponse(result.retryAfterSeconds);
      }
    }
    return await handler({ uid, email });
  } catch (error) {
    return authErrorResponse(error);
  }
}
