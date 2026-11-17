import { NextResponse } from "next/server";
import { getAvatar } from "@/lib/account-db";
import { requireSession } from "@/lib/route-security";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = requireSession(request);
  if (auth.response) return auth.response;
  const avatar = getAvatar(auth.session.userId);
  if (!avatar) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return new NextResponse(new Uint8Array(avatar.avatar), {
    status: 200,
    headers: { "Content-Type": avatar.avatar_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
