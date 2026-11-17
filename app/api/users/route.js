import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/route-security";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;

  const base = (process.env.JELLYFIN_URL || "http://jellyfin:8096").replace(/\/$/, "");
  const client = process.env.JELLYFIN_CLIENT_NAME || "WARP Config Manager";
  const version = process.env.JELLYFIN_CLIENT_VERSION || "1.0.0";
  const deviceId = process.env.JELLYFIN_DEVICE_ID || "warp-config-manager-web";
  try {
    const response = await fetch(`${base}/Users`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `MediaBrowser Client="${client}", Device="WARP Manager UI", DeviceId="${deviceId}", Version="${version}", Token="${auth.session.token}"` },
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Could not load users from Jellyfin" }, { status: response.status === 401 ? 401 : 502 });
    }
    const users = await response.json();
    if (!Array.isArray(users)) throw new Error("Invalid users response");
    return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not reach Jellyfin or its user list was invalid" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
