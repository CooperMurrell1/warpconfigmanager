import { NextResponse } from "next/server";
import { createSession, sessionCookieOptions } from "@/lib/session";
import { requireCsrf } from "@/lib/route-security";

export const runtime = "nodejs";
export async function POST(request) {
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid login request" }, { status: 400 }); }
  const username = typeof body.username === "string" ? body.username.trim().slice(0, 128) : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password || password.length > 1024) return NextResponse.json({ error: "Enter your Jellyfin username and password" }, { status: 400 });
  const base = (process.env.JELLYFIN_URL || "http://jellyfin:8096").replace(/\/$/, "");
  const client = process.env.JELLYFIN_CLIENT_NAME || "WARP Config Manager";
  const version = process.env.JELLYFIN_CLIENT_VERSION || "1.0.0";
  const deviceId = process.env.JELLYFIN_DEVICE_ID || "warp-config-manager-web";
  const authorization = `MediaBrowser Client="${client}", Device="WARP Manager UI", DeviceId="${deviceId}", Version="${version}"`;
  let response;
  try {
    response = await fetch(`${base}/Users/AuthenticateByName`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", "Authorization": authorization },
      body: JSON.stringify({ Username: username, Pw: password }),
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the Jellyfin server" }, { status: 502 });
  }
  if (!response.ok) return NextResponse.json({ error: "Jellyfin rejected those credentials" }, { status: 401 });
  let result;
  try { result = await response.json(); } catch { return NextResponse.json({ error: "Jellyfin returned an invalid login response" }, { status: 502 }); }
  const user = result?.User;
  if (!result?.AccessToken || !user?.Id || !user?.Name) return NextResponse.json({ error: "Jellyfin returned an incomplete login response" }, { status: 502 });
  const session = createSession({ userId: user.Id, username: user.Name, token: result.AccessToken, isAdmin: user.Policy?.IsAdministrator === true });
  const out = NextResponse.json({ ok: true, username: user.Name });
  out.cookies.set(session.name, session.value, sessionCookieOptions());
  return out;
}
