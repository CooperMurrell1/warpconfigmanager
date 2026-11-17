import { NextResponse } from "next/server";
import { requireAdmin, requireCsrf } from "@/lib/route-security";

export const runtime = "nodejs";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function validId(value) { return /^[a-f0-9-]{32,36}$/i.test(value || ""); }

function context(session) {
  const base = (process.env.JELLYFIN_URL || "http://jellyfin:8096").replace(/\/$/, "");
  const client = process.env.JELLYFIN_CLIENT_NAME || "WARP Config Manager";
  const version = process.env.JELLYFIN_CLIENT_VERSION || "1.0.0";
  const deviceId = process.env.JELLYFIN_DEVICE_ID || "warp-config-manager-web";
  const headers = { Authorization: `MediaBrowser Client="${client}", Device="WARP Manager UI", DeviceId="${deviceId}", Version="${version}", Token="${session.token}"` };
  return { url: `${base}/Users`, headers };
}

export async function GET(request, { params }) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const { userId } = await params;
  if (!validId(userId)) return new NextResponse(null, { status: 400 });
  const { url, headers } = context(auth.session);
  try {
    const response = await fetch(`${url}/${encodeURIComponent(userId)}/Images/Primary?fillHeight=320&fillWidth=320&quality=90`, {
      cache: "no-store", signal: AbortSignal.timeout(10000), headers,
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !response.body || !contentType.startsWith("image/")) {
      return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    }
    return new NextResponse(response.body, {
      status: 200,
      headers: { "Content-Type": contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new NextResponse(null, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function POST(request, { params }) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  const { userId } = await params;
  if (!validId(userId)) return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const length = Number(request.headers.get("content-length") || 0);
  if (!imageTypes.has(type)) return NextResponse.json({ error: "Choose a JPEG, PNG, or WebP image" }, { status: 415 });
  if (length > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Profile images must be 5 MB or smaller" }, { status: 413 });

  const { url, headers } = context(auth.session);
  try {
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Profile images must be between 1 byte and 5 MB" }, { status: 413 });
    const response = await fetch(`${url}/${encodeURIComponent(userId)}/Images/Primary`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { ...headers, "Content-Type": type }, body: bytes,
    });
    if (!response.ok) return NextResponse.json({ error: "Jellyfin could not update this profile image" }, { status: response.status >= 500 ? 502 : response.status });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reach Jellyfin" }, { status: 502 });
  }
}

export async function DELETE(request, { params }) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  const { userId } = await params;
  if (!validId(userId)) return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  const { url, headers } = context(auth.session);
  try {
    const response = await fetch(`${url}/${encodeURIComponent(userId)}/Images/Primary`, {
      method: "DELETE", cache: "no-store", signal: AbortSignal.timeout(10000), headers,
    });
    if (!response.ok) return NextResponse.json({ error: "Jellyfin could not remove this profile image" }, { status: response.status >= 500 ? 502 : response.status });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reach Jellyfin" }, { status: 502 });
  }
}
