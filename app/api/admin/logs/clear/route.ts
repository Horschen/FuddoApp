// app/api/admin/logs/clear/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";
import { insertAdminLog } from "../../logsHelper";
import { getAdminActorStringFromRequest } from "../../sessionHelper";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET saknas i miljövariablerna.");
  return new TextEncoder().encode(secret);
}

async function isSuperAdmin(): Promise<boolean> {
  const token = (await cookies()).get("admin_session")?.value;
  if (!token) return false;

  try {
    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload.role === "superadmin";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const ok = await isSuperAdmin();
    if (!ok) {
      return NextResponse.json(
        { error: "Endast SuperAdmin får rensa loggar." },
        { status: 403 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Rensa alla rader (säker filter för UUID)
    const { error } = await supabaseAdmin
      .from("admin_logs")
      .delete()
      .not("id", "is", null);

    if (error) {
      console.error("Kunde inte rensa admin_logs:", error);
      return NextResponse.json(
        { error: "Kunde inte rensa loggar." },
        { status: 500 }
      );
    }

    // Skriv en loggrad som visar att rensning skedde
    const actor = await getAdminActorStringFromRequest(request);
    await insertAdminLog({
      actor,
      action: "clear_logs",
      details: {
        field: "admin_logs",
        from: "many",
        to: "empty",
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("Oväntat fel i /api/admin/logs/clear:", err);
    return NextResponse.json({ error: "Internt serverfel." }, { status: 500 });
  }
}