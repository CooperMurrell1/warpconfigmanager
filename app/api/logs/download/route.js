import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/route-security";

export const runtime = "nodejs";

function diagnosticLines(value) {
  if (Array.isArray(value)) return value.filter(line => line != null && String(line).trim()).map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(line => line != null && String(line).trim()).map(String);
    } catch {}
  }
  return [];
}

export async function GET(request) {
  const auth = requireSession(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "";
  try {
    const state = JSON.parse(await fs.readFile("/data/public-state.json", "utf8"));
    let content;
    let filename;
    if (kind === "generator") {
      const startedAt = url.searchParams.get("started_at") || "";
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(startedAt)) return NextResponse.json({ error: "Invalid log entry" }, { status: 400 });
      const entry = (state.generator_logs || []).find(item => item.started_at === startedAt);
      if (!entry) return NextResponse.json({ error: "Log entry not found" }, { status: 404 });
      const details = diagnosticLines(entry.details);
      if (!details.length) details.push("Detailed generator output was not retained for this run.");
      content = ["Warp Config Manager generator log", `Started: ${entry.started_at}`, `Finished: ${entry.finished_at}`, `Source: ${entry.source}`, `Result: ${entry.result}`, "", ...details, ""].join("\n");
      filename = `generator-${startedAt.replace(/[^0-9TZ]/g, "-")}.log`;
    } else if (kind === "event") {
      const id = Number(url.searchParams.get("id"));
      if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid log entry" }, { status: 400 });
      const entry = (state.logs || []).find(item => item.id === id && ["config", "generator", "service"].includes(item.category));
      if (!entry) return NextResponse.json({ error: "Log entry not found" }, { status: 404 });
      const details = diagnosticLines(entry.details);
      const messageLines = String(entry.message || "").split(/\r?\n/);
      if (!details.length) details.push(...messageLines.slice(1).filter(Boolean));
      if (!details.length) details.push(`Type: ${entry.category}`, `Severity: ${entry.level}`, `Recorded: ${entry.at}`, `Event: ${messageLines[0] || "No message was recorded."}`, "This entry predates structured diagnostics.");
      content = ["Warp Config Manager log", `Time: ${entry.at}`, `Type: ${entry.category}`, `Level: ${entry.level}`, "", messageLines[0], "", "Diagnostics:", ...details, ""].join("\n");
      filename = `${entry.category}-${entry.at.replace(/[^0-9TZ]/g, "-")}-${id}.log`;
    } else if (["config", "service"].includes(kind)) {
      const id = Number(url.searchParams.get("id"));
      if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid log entry" }, { status: 400 });
      const entry = (state.logs || []).find(item => item.id === id && item.category === kind);
      if (!entry) return NextResponse.json({ error: "Log entry not found" }, { status: 404 });
      const details = diagnosticLines(entry.details);
      const messageLines = String(entry.message || "").split(/\r?\n/);
      if (!details.length) details.push(...messageLines.slice(1).filter(Boolean));
      if (!details.length) details.push(`Type: ${entry.category}`, `Severity: ${entry.level}`, `Recorded: ${entry.at}`, `Event: ${messageLines[0] || "No message was recorded."}`, "This entry predates structured diagnostics.");
      content = ["Warp Config Manager log", `Time: ${entry.at}`, `Type: ${entry.category}`, `Level: ${entry.level}`, "", messageLines[0], "", "Diagnostics:", ...details, ""].join("\n");
      filename = `${kind}-${entry.at.replace(/[^0-9TZ]/g, "-")}-${id}.log`;
    } else {
      return NextResponse.json({ error: "Invalid log type" }, { status: 400 });
    }
    return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Logs are unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
