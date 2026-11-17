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
    const archiveId = body?.archive_id;
    if (archiveId !== undefined && !/^[a-f0-9]{32}$/.test(archiveId)) {
      return NextResponse.json({ error: "Invalid saved config" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const result = await submitUiCommand({ action: "private-key", ...(archiveId ? { archive_id: archiveId } : {}) }, 12000, true);
    if (result.pending) {
      return NextResponse.json({ error: "Private key request timed out" }, { status: 504, headers: { "Cache-Control": "no-store" } });
    }
    if (!result.ok || typeof result.private_key !== "string") {
      return NextResponse.json({ error: result.message || "Could not read the private key" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ private_key: result.private_key }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "Could not request the private key" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
