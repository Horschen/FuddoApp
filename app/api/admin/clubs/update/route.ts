// app/api/admin/clubs/update/route.ts
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
  if (!secret) throw new Error("ADMIN_SESSION_SECRET saknas.");
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

export async function POST(request: Request) {
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const id = body?.id as string | undefined;
    if (!id) return NextResponse.json({ error: "id krävs." }, { status: 400 });

    const supabaseAdmin = getSupabaseAdmin();

    const { data: oldClub, error: oldErr } = await supabaseAdmin
      .from("clubs")
      .select("id, slug, name, logo_url, active")
      .eq("id", id)
      .maybeSingle();

    if (oldErr) {
      console.error("Fel vid fetch old club:", oldErr);
      return NextResponse.json({ error: "Kunde inte hämta klubb." }, { status: 500 });
    }
    if (!oldClub) return NextResponse.json({ error: "Klubb hittades inte." }, { status: 404 });

    const patch: any = {};
    if (typeof body.active === "boolean") patch.active = body.active;
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (typeof body.slug === "string") patch.slug = body.slug.trim();

    const { data: updated, error } = await supabaseAdmin
      .from("clubs")
      .update(patch)
      .eq("id", id)
      .select("id, slug, name, logo_url, active, created_at")
      .single();

    if (error) {
      console.error("Fel vid update club:", error);
      return NextResponse.json({ error: "Kunde inte uppdatera klubb." }, { status: 500 });
    }

    const actor = await getAdminActorStringFromRequest(request);

    const fields = ["name", "slug", "active"] as const;
    for (const field of fields) {
      const from = (oldClub as any)[field];
      const to = (updated as any)[field];
      if (JSON.stringify(from) === JSON.stringify(to)) continue;

      await insertAdminLog({
        actor,
        action: "update_club",
        details: { clubId: updated.id, slug: updated.slug, name: updated.name, field, from, to },
      });
    }

    return NextResponse.json({ club: updated }, { status: 200 });
  } catch (err) {
    console.error("Oväntat fel i /api/admin/clubs/update:", err);
    return NextResponse.json({ error: "Internt serverfel." }, { status: 500 });
  }
}