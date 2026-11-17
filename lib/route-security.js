import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { validCsrf } from "@/lib/security";

export function requireSession(request) {
  const session = readSession(request);
  return session
    ? { session, response: null }
    : { session: null, response: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
}

export function requireAdmin(request) {
  const auth = requireSession(request);
  if (auth.response) return auth;
  if (auth.session.isAdmin !== true) {
    return { session: null, response: NextResponse.json({ error: "A Jellyfin administrator account is required" }, { status: 403 }) };
  }
  return auth;
}

export function requireCsrf(request) {
  return validCsrf(request) ? null : NextResponse.json({ error: "Request origin or CSRF check failed" }, { status: 403 });
}