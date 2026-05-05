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
    const body = await request.json().catch(() => null);

    if (!body || typeof body.memberId !== "string") {
      return NextResponse.json(
        { error: "memberId saknas eller är ogiltigt." },
        { status: 400 }
      );
    }

    const memberId = body.memberId;
    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from("member_share_links")
      .update({
        revoked: true,
        revoked_at: new Date().toISOString(),
      })
      .eq("member_id", memberId);

    if (error) {
      console.error("Fel vid återkallning av delningslänk:", error);
      return NextResponse.json(
        { error: "Kunde inte återkalla delningslänk." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Oväntat fel i /api/share/revoke:", err);
    return NextResponse.json(
      { error: "Internt serverfel." },
      { status: 500 }
    );
  }
}