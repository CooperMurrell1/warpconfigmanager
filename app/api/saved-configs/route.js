import { NextResponse } from "next/server";
import { requireAdmin, requireCsrf } from "@/lib/route-security";
import { submitUiCommand } from "@/lib/ui-commands";

export const runtime = "nodejs";
export async function GET(request) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get("archive_id") || "";
  if (!/^[a-f0-9]{32}$/.test(id)) return NextResponse.json({ error: "Invalid saved config" }, { status: 400 });
  try {
    const result = await submitUiCommand({ action: "download-saved-config", archive_id: id }, 30000, true);
    if (result.pending) return NextResponse.json({ error: "The config service did not respond in time" }, { status: 504 });
    if (!result.ok) return NextResponse.json({ error: result.message || "Saved config was not found" }, { status: 404 });
    return new Response(result.config_content, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${result.filename}"`, "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Could not download saved config" }, { status: 503 }); }
}

export async function POST(request) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  if (!/^[a-f0-9]{32}$/.test(body?.archive_id || "")) return NextResponse.json({ error: "Invalid saved config" }, { status: 400 });
  const action = body?.action === "restore" ? "restore-saved-config" : body?.action === "rename" ? "rename-saved-config" : "delete-saved-config";
  try {
    const result = await submitUiCommand({ action, archive_id: body.archive_id });
    return NextResponse.json(result, { status: result.pending ? 202 : result.ok ? 200 : 400 });
  } catch { return NextResponse.json({ error: "Could not process saved config action" }, { status: 503 }); }
}
