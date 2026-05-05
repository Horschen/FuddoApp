import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Admin-klient med service role key
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body.memberId !== "string") {
      return NextResponse.json(
        { error: "memberId saknas eller är ogiltigt." },
        { status: 400 }
      );
    }

    const memberId = body.memberId;
    const token = crypto.randomUUID(); // riktig unik token

    const supabaseAdmin = getSupabaseAdmin();

    // Eftersom primary key = member_id använder vi upsert
    const { data, error } = await supabaseAdmin
      .from("member_share_links")
      .upsert(
        {
          member_id: memberId,
          token,
          revoked: false,
          revoked_at: null,
          created_at: new Date().toISOString(),
        },
        {
          onConflict: "member_id",
        }
      )
      .select("token")
      .single();

    if (error) {
      console.error("Fel vid skapande av delningslänk:", error);
      return NextResponse.json(
        { error: "Kunde inte skapa delningslänk." },
        { status: 500 }
      );
    }

    return NextResponse.json({ token: data.token });
  } catch (err) {
    console.error("Oväntat fel i /api/share/create:", err);
    return NextResponse.json(
      { error: "Internt serverfel." },
      { status: 500 }
    );
  }
}