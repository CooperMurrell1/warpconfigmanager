import { NextResponse } from "next/server";
import { createSession, sessionCookieOptions } from "@/lib/session";
import { registerJellyfinSignIn, storeAvatar } from "@/lib/account-db";
import { requireCsrf } from "@/lib/route-security";

export const runtime = "nodejs";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

async function readLimitedImage(response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AVATAR_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    if (!size) return null;
    const image = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { image.set(chunk, offset); offset += chunk.byteLength; }
    return image;
  } finally {
    reader.releaseLock();
  }
}

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
  let registration;
  try {
    registration = registerJellyfinSignIn({ jellyfinUserId: user.Id, jellyfinUsername: user.Name, isAdministrator: user.Policy?.IsAdministrator === true });
  } catch {
    return NextResponse.json({ error: "Could not save this account in the dashboard database" }, { status: 503 });
  }
  if (registration.error) return NextResponse.json({ error: registration.error }, { status: 403 });

  // Cache the Jellyfin profile image locally so it remains available in the
  // dashboard without proxying an authenticated image request on every view.
  try {
    const imageResponse = await fetch(`${base}/Users/${encodeURIComponent(user.Id)}/Images/Primary`, {
      cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `${authorization}, Token="${result.AccessToken}"` },
    });
    const contentType = (imageResponse.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const contentLength = Number(imageResponse.headers.get("content-length") || 0);
    if (imageResponse.ok && imageTypes.has(contentType) && (!contentLength || contentLength <= MAX_AVATAR_BYTES)) {
      const bytes = await readLimitedImage(imageResponse);
      if (bytes) storeAvatar(registration.user.Id, bytes, contentType);
    }
  } catch {
    // An unavailable profile image must not prevent an otherwise valid sign-in.
  }

  const session = createSession({ userId: registration.user.Id });
  const out = NextResponse.json({ ok: true, username: registration.user.Name });
  out.cookies.set(session.name, session.value, sessionCookieOptions());
  return out;
}
