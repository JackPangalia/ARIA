import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LogBody = {
  type?: string;
  message?: string;
  data?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 204 });
  }

  let body: LogBody;
  try {
    body = (await req.json()) as LogBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ts = new Date().toISOString();
  const t = body.type ?? "log";
  const msg = body.message ?? "";
  if (body.data && Object.keys(body.data).length > 0) {
    console.log(`[ARIA ${ts}] ${t}: ${msg}`, body.data);
  } else {
    console.log(`[ARIA ${ts}] ${t}: ${msg}`);
  }

  return NextResponse.json({ ok: true });
}
