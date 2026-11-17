import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/route-security";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = requireSession(request);
  if (auth.response) return auth.response;
  try {
    const state = JSON.parse(await fs.readFile("/data/public-state.json", "utf8"));
    return NextResponse.json({ ...state, current_user: auth.session.username, current_user_id: auth.session.userId, current_user_role: auth.session.role, current_user_is_admin: auth.session.isAdmin === true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Service state is not ready" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
