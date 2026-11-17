import { NextResponse } from "next/server";
import { requireAdmin, requireCsrf } from "@/lib/route-security";

export const runtime = "nodejs";

function jellyfinContext(session) {
  const base = (process.env.JELLYFIN_URL || "http://jellyfin:8096").replace(/\/$/, "");
  const client = process.env.JELLYFIN_CLIENT_NAME || "WARP Config Manager";
  const version = process.env.JELLYFIN_CLIENT_VERSION || "1.0.0";
  const deviceId = process.env.JELLYFIN_DEVICE_ID || "warp-config-manager-web";
  return {
    base,
    headers: { Authorization: `MediaBrowser Client="${client}", Device="WARP Manager UI", DeviceId="${deviceId}", Version="${version}", Token="${session.token}"` },
  };
}

function validId(value) { return /^[a-f0-9-]{32,36}$/i.test(value || ""); }

async function failure(response, fallback) {
  const message = response.status === 403
    ? "Jellyfin rejected this change. Check that at least one enabled administrator remains."
    : fallback;
  return NextResponse.json({ error: message }, { status: response.status >= 500 ? 502 : response.status });
}

export async function POST(request, { params }) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  const { userId } = await params;
  if (!validId(userId)) return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const { base, headers } = jellyfinContext(auth.session);
  const url = `${base}/Users/${encodeURIComponent(userId)}`;

  try {
    if (body?.action === "delete") {
      if (userId === auth.session.userId) return NextResponse.json({ error: "You cannot delete the account you are signed in with" }, { status: 400 });
      const response = await fetch(url, { method: "DELETE", headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) return failure(response, "Could not delete this account");
      return NextResponse.json({ ok: true });
    }

    if (body?.action === "password") {
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      if (newPassword.length < 1 || newPassword.length > 1024) return NextResponse.json({ error: "Enter a password up to 1024 characters" }, { status: 400 });
      const response = await fetch(`${base}/Users/Password?userId=${encodeURIComponent(userId)}`, {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000),
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ CurrentPw: typeof body.currentPassword === "string" ? body.currentPassword : "", NewPw: newPassword, ResetPassword: false }),
      });
      if (!response.ok) return failure(response, "Could not update this account password");
      return NextResponse.json({ ok: true });
    }

    if (body?.action !== "update") return NextResponse.json({ error: "Unknown account action" }, { status: 400 });
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 128) {
      return NextResponse.json({ error: "Enter a name up to 128 characters" }, { status: 400 });
    }
    if (typeof body.isAdministrator !== "boolean" || typeof body.isDisabled !== "boolean") {
      return NextResponse.json({ error: "Choose a role and account status" }, { status: 400 });
    }
    if (userId === auth.session.userId && (!body.isAdministrator || body.isDisabled)) {
      return NextResponse.json({ error: "You cannot remove administrator access from or disable the account you are signed in with" }, { status: 400 });
    }

    const currentResponse = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!currentResponse.ok) return failure(currentResponse, "Could not load this account");
    const current = await currentResponse.json();
    const nameResponse = await fetch(`${base}/Users?userId=${encodeURIComponent(userId)}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ Name: body.name.trim(), Configuration: current.Configuration || {} }),
    });
    if (!nameResponse.ok) return failure(nameResponse, "Could not update the account name");

    const policy = {
      ...(current.Policy || {}),
      IsAdministrator: body.isAdministrator,
      IsDisabled: body.isDisabled,
    };
    const policyResponse = await fetch(`${url}/Policy`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(policy),
    });
    if (!policyResponse.ok) return failure(policyResponse, "Name was saved, but Jellyfin could not update this account's role or status");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reach Jellyfin" }, { status: 502 });
  }
}
