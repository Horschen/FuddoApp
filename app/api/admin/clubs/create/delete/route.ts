// app/api/admin/clubs/delete/route.ts
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
    if (!ok) return NextResponse.json({ error: "Endast SuperAdmin." }, { status: 403 });

    const body = await request.json().catch(() => null);
    const id = body?.id as string | undefined;
    if (!id) return NextResponse.json({ error: "id krävs." }, { status: 400 });

    const supabaseAdmin = getSupabaseAdmin();

    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select("id, slug, name, active")
      .eq("id", id)
      .maybeSingle();

    if (!club) return NextResponse.json({ error: "Klubb hittades inte." }, { status: 404 });

    const { data: updated, error } = await supabaseAdmin
      .from("clubs")
      .update({ active: false })
      .eq("id", id)
      .select("id, slug, name, logo_url, active, created_at")
      .single();

    if (error) {
      console.error("Fel vid soft delete club:", error);
      return NextResponse.json({ error: "Kunde inte ta bort klubb." }, { status: 500 });
    }

    const actor = await getAdminActorStringFromRequest(request);
    await insertAdminLog({
      actor,
      action: "delete_club",
      details: { clubId: updated.id, slug: updated.slug, name: updated.name, field: "active", from: true, to: false },
    });

    return NextResponse.json({ club: updated }, { status: 200 });
  } catch (err) {
    console.error("Oväntat fel i /api/admin/clubs/delete:", err);
    return NextResponse.json({ error: "Internt serverfel." }, { status: 500 });
  }
}