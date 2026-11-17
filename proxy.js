import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { readSession } from "@/lib/session";
import { validCsrf, validOrigin } from "@/lib/security";

const publicPaths = new Set(["/login", "/api/auth/login", "/api/healthz"]);

export function proxy(request) {
  const path = request.nextUrl.pathname;
  if (publicPaths.has(path)) {
    if (request.method !== "GET" && (!validOrigin(request) || !validCsrf(request))) {
      return NextResponse.json({ error: "Request origin or CSRF check failed" }, { status: 403 });
    }
    const response = NextResponse.next();
    if (request.method === "GET" && !request.cookies.get("warp_csrf")) {
      response.cookies.set("warp_csrf", randomBytes(32).toString("hex"), {
        httpOnly: false, secure: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 12,
      });
    }
    return response;
  }
  const session = readSession(request);
  if (!session) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if ((path === "/accounts" || path.startsWith("/accounts/")) && session.isAdmin !== true) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (request.method !== "GET" && (!validOrigin(request) || !validCsrf(request))) {
    return NextResponse.json({ error: "Request origin or CSRF check failed" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
