import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin, requireCsrf } from "@/lib/route-security";
import { submitUiCommand } from "@/lib/ui-commands";

export const runtime = "nodejs";
const archiveDir = "/data/saved-configs";

export async function GET(request) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get("archive_id") || "";
  if (!/^[a-f0-9]{32}$/.test(id)) return NextResponse.json({ error: "Invalid saved config" }, { status: 400 });
  try {
    const configPath = path.join(archiveDir, `${id}.conf`);
    const stat = await fs.lstat(configPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768) throw new Error("invalid archive");
    const data = await fs.readFile(configPath);
    return new Response(data, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="saved-${id}.conf"`, "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Saved config was not found" }, { status: 404 }); }
}

export async function POST(request) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  if (!/^[a-f0-9]{32}$/.test(body?.archive_id || "")) return NextResponse.json({ error: "Invalid saved config" }, { status: 400 });
  const action = body?.action === "restore" ? "restore-saved-config" : "delete-saved-config";
  try {
    const result = await submitUiCommand({ action, archive_id: body.archive_id });
    return NextResponse.json(result, { status: result.pending ? 202 : result.ok ? 200 : 400 });
  } catch { return NextResponse.json({ error: "Could not delete saved config" }, { status: 503 }); }
}
