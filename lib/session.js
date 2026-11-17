import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const SESSION_COOKIE = "warp_session";
const SESSION_MAX_AGE = 60 * 60 * 12;

function keyBytes() {
  const value = readFileSync("/data/session_secret", "utf8").trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("Invalid session secret file");
  return Buffer.from(value, "hex");
}

export function createSession(data) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE }));
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const packed = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  return { name: SESSION_COOKIE, value: packed, maxAge: SESSION_MAX_AGE };
}

export function readSession(request) {
  try {
    const packed = request.cookies.get(SESSION_COOKIE)?.value;
    if (!packed) return null;
    const bytes = Buffer.from(packed, "base64url");
    if (bytes.length < 29 || bytes.length > 8192) return null;
    const iv = bytes.subarray(0, 12);
    const tag = bytes.subarray(12, 28);
    const encrypted = bytes.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", keyBytes(), iv);
    decipher.setAuthTag(tag);
    const data = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000) || !data.userId || !data.username || !data.token) return null;
    return data;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE };
}
export function sessionCookieName() { return SESSION_COOKIE; }
