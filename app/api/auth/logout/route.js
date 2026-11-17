import { NextResponse } from "next/server";
import { readSession, sessionCookieName } from "@/lib/session";
import { requireCsrf } from "@/lib/route-security";

export const runtime = "nodejs";
export async function POST(request) {
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  const session = readSession(request);
  if (session?.token) {
    const base = (process.env.JELLYFIN_URL || "http://jellyfin:8096").replace(/\/$/, "");
    const client = process.env.JELLYFIN_CLIENT_NAME || "WARP Config Manager";
    const version = process.env.JELLYFIN_CLIENT_VERSION || "1.0.0";
    const deviceId = process.env.JELLYFIN_DEVICE_ID || "warp-config-manager-web";
    try {
      await fetch(`${base}/Sessions/Logout`, {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000),
        headers: { "Authorization": `MediaBrowser Client="${client}", Device="WARP Manager UI", DeviceId="${deviceId}", Version="${version}", Token="${session.token}"` },
      });
    } catch { /* Clear the local session even if Jellyfin is temporarily unavailable. */ }
  }
  const out = NextResponse.json({ ok: true });
  out.cookies.set(sessionCookieName(), "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return out;
}
