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
  const seconds = Number(body?.retention_seconds);
  if (!Number.isInteger(seconds) || seconds < 3600 || seconds > 365 * 86400) return NextResponse.json({ error: "Retention must be between 1 hour and 365 days" }, { status: 400 });
  try {
    const result = await submitUiCommand({ action: "config-retention", retention_seconds: seconds });
    return NextResponse.json(result, { status: result.pending ? 202 : result.ok ? 200 : 400 });
  } catch { return NextResponse.json({ error: "Could not save config retention" }, { status: 503 }); }
}
