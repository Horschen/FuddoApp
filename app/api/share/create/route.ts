// app/api/share/create/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAdminLog } from "../../admin/logsHelper";
import { getAdminActorStringFromRequest } from "../../admin/sessionHelper";

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

    // Hämta målmedlem (för loggarna)
    const { data: member, error: memberError } = await supabaseAdmin
      .from("members")
      .select("id, user_id, first_name, last_name")
      .eq("id", memberId)
      .maybeSingle();

    if (memberError) {
      console.error("Fel vid hämtning av medlem i share/create:", memberError);
    }

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

    // Loggning
    const actor = await getAdminActorStringFromRequest(request);
    const targetName = member
      ? `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
      : null;
    const userId = member?.user_id ?? null;

    await insertAdminLog({
      actor,
      action: "create_share_link",
      details: {
        memberId,
        userId,
        targetName,
        field: "share_link",
        from: "none",
        to: "created",
        token,
      },
    });

    return NextResponse.json({ token: data.token });
  } catch (err) {
    console.error("Oväntat fel i /api/share/create:", err);
    return NextResponse.json(
      { error: "Internt serverfel." },
      { status: 500 }
    );
  }
}