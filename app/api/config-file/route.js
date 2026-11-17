import { NextResponse } from "next/server";
import { requireAdmin, requireCsrf } from "@/lib/route-security";
import { submitUiCommand } from "@/lib/ui-commands";

export const runtime = "nodejs";

export async function POST(request) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const filename = typeof body?.config_filename === "string" ? body.config_filename.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}\.conf$/.test(filename)) {
    return NextResponse.json({ error: "Use a simple .conf filename without a directory path" }, { status: 400 });
  }
  try {
    const result = await submitUiCommand({ action: "config-filename", config_filename: filename });
    return NextResponse.json(result, { status: result.pending ? 202 : result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json({ error: "Could not save the config filename" }, { status: 503 });
  }
}