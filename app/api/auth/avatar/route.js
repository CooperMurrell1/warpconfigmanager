import { NextResponse } from "next/server";
import { requireSession } from "@/lib/route-security";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = requireSession(request);
  if (auth.response) return auth.response;

  const base = (process.env.JELLYFIN_URL || "http://jellyfin:8096").replace(/\/$/, "");
  const url = `${base}/Users/${encodeURIComponent(auth.session.userId)}/Images/Primary?fillHeight=256&fillWidth=256&quality=90`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: { "X-Emby-Token": auth.session.token },
    });

    if (!response.ok || !response.body) {
      return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    }

    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
