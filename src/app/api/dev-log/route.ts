import { NextRequest, NextResponse } from "next/server";
import { truncate } from "@/lib/server/context-dev-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LogBody = {
  type?: string;
  message?: string;
  data?: Record<string, unknown>;
};

function isVerboseDevLogging(): boolean {
  return process.env.ARIA_DEV_VERBOSE === "1";
}

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

  const type = body.type ?? "log";
  const msg = body.message ?? "";

  // Partial/final STT lines flood the terminal; enable with ARIA_DEV_VERBOSE=1.
  if (type === "utterance" && !isVerboseDevLogging()) {
    return NextResponse.json({ ok: true });
  }

  if (type === "ask" && body.data && "messages" in body.data) {
    const question =
      typeof body.data.question === "string" ? body.data.question : msg;
    console.log(`[ARIA] mic ask │ ${truncate(question, 100)}`);
    return NextResponse.json({ ok: true });
  }

  if (type === "pipeline" && body.data) {
    const ms =
      typeof body.data.ms === "number" ? `${Math.round(body.data.ms)}ms` : "—";
    const extra = Object.entries(body.data)
      .filter(([k]) => k !== "ms")
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    console.log(
      `[ARIA] client │ ${ms.padStart(6, " ")} │ ${msg}${extra ? ` │ ${extra}` : ""}`
    );
    return NextResponse.json({ ok: true });
  }

  const line = body.data && Object.keys(body.data).length > 0
    ? `${msg} ${JSON.stringify(body.data)}`
    : msg;

  console.log(`[ARIA] ${type} │ ${truncate(line, 140)}`);

  return NextResponse.json({ ok: true });
}
