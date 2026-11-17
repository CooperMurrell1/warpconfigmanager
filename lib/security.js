import { timingSafeEqual } from "node:crypto";

function equal(a, b) {
  const x = Buffer.from(a || "");
  const y = Buffer.from(b || "");
  return x.length === y.length && timingSafeEqual(x, y);
}

export function validOrigin(request) {
  try {
    const origin = request.headers.get("origin");
    const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim();
    return Boolean(origin && host && new URL(origin).host.toLowerCase() === host.toLowerCase());
  } catch { return false; }
}

export function validCsrf(request) {
  const cookie = request.cookies.get("warp_csrf")?.value || "";
  const header = request.headers.get("x-csrf-token") || "";
  return validOrigin(request) && /^[a-f0-9]{64}$/i.test(cookie) && equal(cookie, header);
}
