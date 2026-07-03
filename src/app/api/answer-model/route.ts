import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { loadEntitlements, setAnswerModel } from "@/lib/plan/repository";
import {
  ASK_MODELS,
  DEFAULT_ASK_MODEL_ID,
  isAskModelId,
  type AskModelId,
} from "@/lib/aria/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateAnswerModelSchema = z.object({
  answerModel: z.string().refine(isAskModelId, "Invalid answer model."),
});

function resolveCurrent(answerModel: unknown): AskModelId {
  return isAskModelId(answerModel) ? answerModel : DEFAULT_ASK_MODEL_ID;
}

function payload(current: AskModelId) {
  return {
    current,
    options: ASK_MODELS,
  };
}

export async function GET(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    const { plan } = await loadEntitlements(uid);
    return jsonOk(payload(resolveCurrent(plan.answerModel)));
  });
}

export async function PATCH(req: NextRequest) {
  return withAuth(req, async ({ uid }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const parsed = UpdateAnswerModelSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid answer model payload.", 400);
    }

    try {
      const plan = await setAnswerModel(uid, parsed.data.answerModel);
      return jsonOk(payload(resolveCurrent(plan.answerModel)));
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to update answer model.";
      return jsonError(msg, 400);
    }
  });
}
