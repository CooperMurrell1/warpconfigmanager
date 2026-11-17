import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createStoredSession, deleteStoredSession, readStoredSession } from "@/lib/account-db";

const SESSION_COOKIE = "warp_session";
const SESSION_MAX_AGE = 60 * 60 * 12;

function keyBytes() {
  const value = readFileSync("/data/session_secret", "utf8").trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("Invalid session secret file");
  return Buffer.from(value, "hex");
}

function sessionHash(value) {
  return createHmac("sha256", keyBytes()).update(value).digest("hex");
}

export function createSession({ userId }) {
  const value = randomBytes(32).toString("base64url");
  const created = createStoredSession(sessionHash(value), userId, SESSION_MAX_AGE);
  if (!created) throw new Error("Account is disabled or unavailable");
  return { name: SESSION_COOKIE, value, maxAge: SESSION_MAX_AGE };
}

export function readSession(request) {
  try {
    const value = request.cookies.get(SESSION_COOKIE)?.value;
    if (!value || value.length > 128) return null;
    return readStoredSession(sessionHash(value));
  } catch {
    return null;
  }
}

export function clearSession(request) {
  try {
    const value = request.cookies.get(SESSION_COOKIE)?.value;
    if (value && value.length <= 128) deleteStoredSession(sessionHash(value));
  } catch { /* The browser cookie is still cleared by the logout route. */ }
}

export function sessionCookieOptions() {
  return { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE };
}

export function sessionCookieName() { return SESSION_COOKIE; }
