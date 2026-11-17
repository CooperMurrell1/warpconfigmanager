import { NextResponse } from "next/server";
import { requireAdmin, requireCsrf } from "@/lib/route-security";
import { submitUiCommand } from "@/lib/ui-commands";

export const runtime = "nodejs";

export async function POST(request) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  try {
    let body = {};
    try { body = await request.json(); } catch {}
    if (typeof body?.config_name !== "string" || !body.config_name.trim() || body.config_name.trim().length > 64) {
      return NextResponse.json({ error: "Enter a config name between 1 and 64 characters" }, { status: 400 });
    }
    const result = await submitUiCommand({ action: "update", config_name: body.config_name.trim() });
    return NextResponse.json(result, { status: result.pending ? 202 : result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json({ error: "Could not queue the update" }, { status: 503 });
  }
}
