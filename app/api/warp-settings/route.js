import { NextResponse } from "next/server";
import { requireAdmin, requireCsrf } from "@/lib/route-security";
import { submitUiCommand } from "@/lib/ui-commands";

export const runtime = "nodejs";

export async function POST(request) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const settings = body?.warp_settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings) ||
      ["device_type", "locale", "device_name", "device_model"].some(key => typeof settings[key] !== "string")) {
    return NextResponse.json({ error: "Provide device type, locale, device name, and device model as text" }, { status: 400 });
  }
  if (settings.device_type.length > 32 || settings.locale.length > 20 || settings.device_name.length > 64 || settings.device_model.length > 64) {
    return NextResponse.json({ error: "One or more registration settings exceed the allowed length" }, { status: 400 });
  }
  try {
    const result = await submitUiCommand({ action: "warp-settings", warp_settings: settings });
    return NextResponse.json(result, { status: result.pending ? 202 : result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json({ error: "Could not save WARP registration settings" }, { status: 503 });
  }
}
