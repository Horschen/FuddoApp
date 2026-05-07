// app/api/admin/clubs/logo-upload/route.ts
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

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "FormData krävs." }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const clubId = formData.get("clubId");

    if (!(file instanceof File) || typeof clubId !== "string") {
      return NextResponse.json({ error: "file och clubId måste skickas." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: club, error: clubErr } = await supabaseAdmin
      .from("clubs")
      .select("id, slug, name, logo_url")
      .eq("id", clubId)
      .maybeSingle();

    if (clubErr || !club) {
      return NextResponse.json({ error: "Klubb hittades inte." }, { status: 404 });
    }

    const fileExt = file.name.split(".").pop() || "png";
    const path = `${clubId}/${Date.now()}.${fileExt}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("club-logos")
      .upload(path, file, { upsert: true, cacheControl: "3600" });

    if (uploadError || !uploadData) {
      console.error("UploadError (club-logos):", uploadError);
      return NextResponse.json({ error: "Kunde inte ladda upp bild." }, { status: 500 });
    }

    const { data: publicData } = supabaseAdmin.storage
      .from("club-logos")
      .getPublicUrl(uploadData.path);

    const publicUrl = publicData.publicUrl;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("clubs")
      .update({ logo_url: publicUrl })
      .eq("id", clubId)
      .select("id, slug, name, logo_url, active, created_at")
      .single();

    if (updateError) {
      console.error("Fel vid update clubs.logo_url:", updateError);
      return NextResponse.json({ error: "Kunde inte spara logo_url." }, { status: 500 });
    }

    const actor = await getAdminActorStringFromRequest(request);
    await insertAdminLog({
      actor,
      action: "upload_club_logo",
      details: {
        clubId,
        slug: updated.slug,
        name: updated.name,
        field: "logo_url",
        from: club.logo_url ?? null,
        to: publicUrl,
      },
    });

    return NextResponse.json({ club: updated }, { status: 200 });
  } catch (err) {
    console.error("Oväntat fel i /api/admin/clubs/logo-upload:", err);
    return NextResponse.json({ error: "Internt serverfel." }, { status: 500 });
  }
}