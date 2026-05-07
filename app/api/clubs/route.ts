// app/api/clubs/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabaseAnon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const supabase = getSupabaseAnon();

    const { data, error } = await supabase
      .from("clubs")
      .select("id, slug, name, logo_url, active")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Fel vid hämtning av clubs:", error);
      return NextResponse.json(
        { error: "Kunde inte hämta klubbar." },
        { status: 500 }
      );
    }

    return NextResponse.json({ clubs: data ?? [] }, { status: 200 });
  } catch (err) {
    console.error("Oväntat fel i /api/clubs:", err);
    return NextResponse.json({ error: "Internt serverfel." }, { status: 500 });
  }
}