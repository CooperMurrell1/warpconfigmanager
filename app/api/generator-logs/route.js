import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/route-security";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = requireSession(request);
  if (auth.response) return auth.response;
  const startedAt = new URL(request.url).searchParams.get("started_at") || "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(startedAt)) {
    return NextResponse.json({ error: "Invalid log entry" }, { status: 400 });
  }
  try {
    const state = JSON.parse(await fs.readFile("/data/public-state.json", "utf8"));
    const entry = (state.generator_logs || []).find(item => item.started_at === startedAt);
    if (!entry) return NextResponse.json({ error: "Log entry not found" }, { status: 404 });
    let details = [];
    try { details = JSON.parse(entry.details || "[]"); } catch {}
    const content = [
      "Warp Config Manager generator log",
      `Started: ${entry.started_at}`,
      `Finished: ${entry.finished_at}`,
      `Source: ${entry.source}`,
      `Result: ${entry.result}`,
      "",
      ...details,
      "",
    ].join("\n");
    const filename = `generator-${startedAt.replace(/[^0-9TZ]/g, "-")}.log`;
    return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Generator logs are unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
