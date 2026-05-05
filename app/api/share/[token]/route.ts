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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || token.length < 10) {
    return NextResponse.json(
      { error: "Invalid token" },
      { status: 400 }
    );
  }

  const supabaseAdmin = getSupabaseAdmin();

  // 1) Hämta delningslänken
  const { data: link, error: linkError } = await supabaseAdmin
    .from("member_share_links")
    .select("member_id, revoked")
    .eq("token", token)
    .single();

  if (linkError || !link || link.revoked) {
    return NextResponse.json(
      { error: "Link not found or revoked" },
      { status: 404 }
    );
  }

  // 2) Hämta medlemmen
  const { data: member, error: memberError } = await supabaseAdmin
    .from("members")
    .select(
      `
      id,
      first_name,
      last_name,
      age,
      birth_ymd,
      belt_rank,
      next_belt_rank,
      attended_sessions,
      required_sessions,
      progress,
      avatar_url,
      member_comment,
      visibility_show_age,
      visibility_show_belt_info,
      visibility_show_grading_status,
      visibility_show_member_comment,
      grading_kihon,
      grading_kata,
      grading_kumite,
      grading_physical,
      physical_enabled
    `
    )
    .eq("id", link.member_id)
    .single();

  if (memberError || !member) {
    return NextResponse.json(
      { error: "Member not found" },
      { status: 404 }
    );
  }

  // 3) Skicka tillbaka bara det som får visas
  return NextResponse.json({
    member: {
      id: member.id,
      firstName: member.first_name ?? "",
      lastName: member.last_name ?? "",
      age: member.age ?? 0,
      birthYmd: member.birth_ymd ?? "",
      beltRank: member.belt_rank ?? "",
      nextBeltRank: member.next_belt_rank ?? "",
      attendedSessions: member.attended_sessions ?? 0,
      requiredSessions: member.required_sessions ?? 0,
      progress: member.progress ?? 0,
      avatarUrl: member.avatar_url ?? "/main.png",
      memberComment: member.member_comment ?? "",
      visibility: {
        showAge: member.visibility_show_age ?? true,
        showBeltInfo: member.visibility_show_belt_info ?? true,
        showGradingStatus: member.visibility_show_grading_status ?? true,
        showMemberComment: member.visibility_show_member_comment ?? true,
      },
      gradingStatus: {
        kihon: member.grading_kihon ?? "not_ready",
        kata: member.grading_kata ?? "not_ready",
        kumite: member.grading_kumite ?? "not_ready",
        physical: member.grading_physical ?? "not_ready",
      },
      physicalEnabled: member.physical_enabled ?? false,
    },
  });
}