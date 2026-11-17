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
  const seconds = Number(body?.interval_seconds);
  if (!Number.isInteger(seconds) || seconds < 300 || seconds > 7776000) {
    return NextResponse.json({ error: "Interval must be between 300 seconds and 90 days" }, { status: 400 });
  }
  try {
    const result = await submitUiCommand({ action: "interval", interval_seconds: seconds });
    return NextResponse.json(result, { status: result.pending ? 202 : result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json({ error: "Could not queue the interval change" }, { status: 503 });
  }
}
