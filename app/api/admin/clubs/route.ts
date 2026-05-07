// app/api/admin/clubs/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";

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

async function requireSuperAdmin(): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const token = (await cookies()).get("admin_session")?.value;
  if (!token) return { ok: false, status: 401, error: "Ingen admin-session." };

  try {
    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret);
    if (payload.role !== "superadmin") {
      return { ok: false, status: 403, error: "Endast SuperAdmin." };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 401, error: "Ogiltig admin-session." };
  }
}

export async function GET() {
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("clubs")
      .select("id, slug, name, logo_url, active, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fel vid GET /api/admin/clubs:", error);
      return NextResponse.json(
        { error: "Kunde inte hämta klubbar." },
        { status: 500 }
      );
    }

    return NextResponse.json({ clubs: data ?? [] }, { status: 200 });
  } catch (err) {
    console.error("Oväntat fel i GET /api/admin/clubs:", err);
    return NextResponse.json({ error: "Internt serverfel." }, { status: 500 });
  }
}