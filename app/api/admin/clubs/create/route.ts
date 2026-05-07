// app/api/admin/clubs/create/route.ts
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

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request: Request) {
  try {
    const ok = await isSuperAdmin();
    if (!ok) {
      return NextResponse.json({ error: "Endast SuperAdmin." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const name = (body?.name ?? "").trim();
    let slug = (body?.slug ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "name krävs." }, { status: 400 });
    }
    if (!slug) slug = slugify(name);

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("clubs")
      .insert({ name, slug, active: true, logo_url: null })
      .select("id, slug, name, logo_url, active, created_at")
      .single();

    if (error) {
      console.error("Fel vid create club:", error);
      return NextResponse.json(
        { error: "Kunde inte skapa klubb (slug kanske redan finns)." },
        { status: 500 }
      );
    }

    const actor = await getAdminActorStringFromRequest(request);
    await insertAdminLog({
      actor,
      action: "create_club",
      details: { clubId: data.id, slug: data.slug, name: data.name },
    });

    return NextResponse.json({ club: data }, { status: 200 });
  } catch (err) {
    console.error("Oväntat fel i /api/admin/clubs/create:", err);
    return NextResponse.json({ error: "Internt serverfel." }, { status: 500 });
  }
}