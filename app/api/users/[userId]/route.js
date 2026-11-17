import { NextResponse } from "next/server";
import { removeAppUser, updateAppUser } from "@/lib/account-db";
import { requireAdmin, requireCsrf } from "@/lib/route-security";

export const runtime = "nodejs";
const validId = value => /^[a-f0-9-]{32,36}$/i.test(value || "");

export async function POST(request, { params }) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  const { userId } = await params;
  if (!validId(userId)) return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  if (body?.action === "delete") {
    if (userId === auth.session.userId) return NextResponse.json({ error: "You cannot remove the account you are signed in with" }, { status: 400 });
    const result = removeAppUser(userId);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body?.action !== "update") return NextResponse.json({ error: "Unknown account action" }, { status: 400 });
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 128) return NextResponse.json({ error: "Enter a display name up to 128 characters" }, { status: 400 });
  if (!["admin", "readonly", "viewer"].includes(body.role) || typeof body.isDisabled !== "boolean") {
    return NextResponse.json({ error: "Choose a dashboard role and account status" }, { status: 400 });
  }

  const result = updateAppUser(userId, { name, role: body.role, isDisabled: body.isDisabled });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, user: result.user });
}
