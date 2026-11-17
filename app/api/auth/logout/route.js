import { NextResponse } from "next/server";
import { clearSession, sessionCookieName } from "@/lib/session";
import { requireCsrf } from "@/lib/route-security";

export const runtime = "nodejs";
export async function POST(request) {
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  clearSession(request);
  const out = NextResponse.json({ ok: true });
  out.cookies.set(sessionCookieName(), "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return out;
}
