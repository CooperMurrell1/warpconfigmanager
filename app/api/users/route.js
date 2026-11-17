import { NextResponse } from "next/server";
import { listAppUsers } from "@/lib/account-db";
import { requireAdmin } from "@/lib/route-security";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  return NextResponse.json({ users: listAppUsers() }, { headers: { "Cache-Control": "no-store" } });
}
