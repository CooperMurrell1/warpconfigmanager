import { NextResponse } from "next/server";
import { clearAvatar, getAvatar, storeAvatar } from "@/lib/account-db";
import { requireAdmin, requireCsrf } from "@/lib/route-security";

export const runtime = "nodejs";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const validId = value => /^[a-f0-9-]{32,36}$/i.test(value || "");

export async function GET(request, { params }) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const { userId } = await params;
  if (!validId(userId)) return new NextResponse(null, { status: 400 });
  const avatar = getAvatar(userId);
  if (!avatar) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return new NextResponse(new Uint8Array(avatar.avatar), {
    status: 200,
    headers: { "Content-Type": avatar.avatar_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function POST(request, { params }) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  const { userId } = await params;
  if (!validId(userId)) return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const length = Number(request.headers.get("content-length") || 0);
  if (!imageTypes.has(type)) return NextResponse.json({ error: "Choose a JPEG, PNG, or WebP image" }, { status: 415 });
  if (length > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Profile images must be 5 MB or smaller" }, { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Profile images must be between 1 byte and 5 MB" }, { status: 413 });
  if (!storeAvatar(userId, bytes, type)) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  const { userId } = await params;
  if (!validId(userId)) return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });
  if (!clearAvatar(userId)) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
