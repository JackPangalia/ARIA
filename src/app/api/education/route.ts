import { EducationMutationSchema } from "@/lib/education/model";
import { readEducation, updateEducation } from "@/lib/education/repository";
import { jsonError, withAuth } from "@/lib/sessions/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(state: Awaited<ReturnType<typeof readEducation>>) {
  return Response.json(state, { headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  return withAuth(request, async ({ uid }) => response(await readEducation(uid)));
}

export async function PATCH(request: Request) {
  return withAuth(request, async ({ uid }) => {
    const parsed = EducationMutationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Invalid education update.", 400);
    return response(await updateEducation(uid, parsed.data));
  });
}
