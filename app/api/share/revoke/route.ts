// app/api/share/revoke/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAdminLog } from "../../admin/logsHelper";
import { getAdminActorStringFromRequest } from "../../admin/sessionHelper";

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

    // Hämta målmedlem + ev. befintlig token för logg
    const [{ data: member, error: memberError }, { data: link, error: linkError }] =
      await Promise.all([
        supabaseAdmin
          .from("members")
          .select("id, user_id, first_name, last_name")
          .eq("id", memberId)
          .maybeSingle(),
        supabaseAdmin
          .from("member_share_links")
          .select("token")
          .eq("member_id", memberId)
          .maybeSingle(),
      ]);

    if (memberError) {
      console.error("Fel vid hämtning av medlem i share/revoke:", memberError);
    }
    if (linkError) {
      console.error("Fel vid hämtning av länk i share/revoke:", linkError);
    }

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

    // Loggning
    const actor = await getAdminActorStringFromRequest(request);
    const targetName = member
      ? `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
      : null;
    const userId = member?.user_id ?? null;

    await insertAdminLog({
      actor,
      action: "revoke_share_link",
      details: {
        memberId,
        userId,
        targetName,
        field: "share_link",
        from: "active",
        to: "revoked",
        token: link?.token ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Oväntat fel i /api/share/revoke:", err);
    return NextResponse.json(
      { error: "Internt serverfel." },
      { status: 500 }
    );
  }
}