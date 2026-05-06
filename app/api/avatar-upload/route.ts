// app/api/avatar-upload/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "FormData (multipart/form-data) krävs." },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const memberId = formData.get("memberId");

    if (!(file instanceof File) || typeof memberId !== "string") {
      return NextResponse.json(
        { error: "file och memberId måste skickas med." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // ---- 1) Ladda upp filen till bucket "avatars" ----
    const fileExt = file.name.split(".").pop() || "jpg";
    const filePath = `${memberId}/${Date.now()}.${fileExt}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("avatars")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError || !uploadData) {
      console.error("Fel vid uppladdning av avatar:", uploadError);
      return NextResponse.json(
        { error: "Kunde inte ladda upp bild." },
        { status: 500 }
      );
    }

    // ---- 2) Hämta publik URL ----
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("avatars").getPublicUrl(uploadData.path);

    // ---- 3) Uppdatera members.avatar_url ----
    const { error: updateError } = await supabaseAdmin
      .from("members")
      .update({ avatar_url: publicUrl })
      .eq("id", memberId);

    if (updateError) {
      console.error("Fel vid uppdatering av avatar_url:", updateError);
      return NextResponse.json(
        { error: "Kunde inte uppdatera medlemmen." },
        { status: 500 }
      );
    }

    return NextResponse.json({ avatarUrl: publicUrl });
  } catch (err) {
    console.error("Oväntat fel i /api/avatar-upload:", err);
    return NextResponse.json(
      { error: "Internt serverfel." },
      { status: 500 }
    );
  }
}