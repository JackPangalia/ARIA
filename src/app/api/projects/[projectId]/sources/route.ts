import { NextRequest } from "next/server";
import { jsonError, jsonOk, withAuth } from "@/lib/sessions/api-response";
import { CreateProjectSourceSchema } from "@/lib/projects/types";
import {
  createSource,
  extractProjectSourceText,
  listSources,
} from "@/lib/projects/sources-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { projectId } = await context.params;
    try {
      const sources = await listSources(uid, projectId);
      return jsonOk({ sources });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to list project sources.";
      return jsonError(msg, msg.includes("not found") ? 404 : 400);
    }
  });
}

export async function POST(req: NextRequest, context: RouteContext) {
  return withAuth(req, async ({ uid }) => {
    const { projectId } = await context.params;
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return jsonError("Invalid multipart form data.", 400);
    }

    const file = form.get("file");
    const pastedText = form.get("text");
    const pastedName = form.get("name");

    try {
      let name: string;
      let mimeType: string;
      let byteSize: number;
      let bytes: Uint8Array;

      if (file instanceof File) {
        name = file.name || "Untitled source";
        mimeType = file.type || "application/octet-stream";
        byteSize = file.size;
        bytes = new Uint8Array(await file.arrayBuffer());
      } else if (typeof pastedText === "string" && pastedText.trim()) {
        name =
          typeof pastedName === "string" && pastedName.trim()
            ? pastedName.trim()
            : "Pasted source";
        mimeType = "text/plain";
        bytes = new TextEncoder().encode(pastedText);
        byteSize = bytes.byteLength;
      } else {
        return jsonError("Upload a file or provide source text.", 400);
      }

      const extracted = await extractProjectSourceText({
        name,
        mimeType,
        bytes,
      });
      const parsed = CreateProjectSourceSchema.safeParse({
        name,
        mimeType,
        kind: extracted.kind,
        byteSize,
        text: extracted.text,
      });
      if (!parsed.success) {
        return jsonError("Invalid project source.", 400);
      }

      const source = await createSource(uid, projectId, parsed.data);
      return jsonOk(source, 201);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to create project source.";
      return jsonError(msg, msg.includes("not found") ? 404 : 400);
    }
  }, { rateLimit: { name: "source_upload", limit: 10, windowSeconds: 60 } });
}
