// app/api/admin/members/update/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAdminLog } from "../../logsHelper";
import { getAdminActorStringFromRequest } from "../../sessionHelper";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

type UpdateMemberBody = {
  id: string;
  userId?: string;
  firstName: string;
  lastName: string;
  age: number;
  birthYmd: string;
  beltRank: string;
  nextBeltRank: string;
  attendedSessions: number;
  requiredSessions: number;
  progress: number;
  avatarUrl: string;
  memberComment: string;
  instructorComment: string;
  visibility: {
    showAge: boolean;
    showBeltInfo: boolean;
    showGradingStatus: boolean;
    showMemberComment: boolean;
  };
  gradingStatus: {
    kihon: string;
    kata: string;
    kumite: string;
    physical: string;
  };
  physicalEnabled: boolean;
  isPublic: boolean;
  role: string;
};

function safeJson(v: any) {
  return v === undefined ? null : v;
}

/**
 * Här väljer vi vilka fält som ska loggas vid update_member.
 * Senare kan vi göra denna lista dynamisk via en tabell + kryssrutor i adminpanelen.
 */
const MEMBER_UPDATE_LOG_FIELDS: Array<{
  field: string;
  getOld: (oldRow: any) => any;
  getNew: (newRow: any) => any;
}> = [
  { field: "is_public", getOld: (o) => o.is_public, getNew: (n) => n.is_public },
  { field: "role", getOld: (o) => o.role, getNew: (n) => n.role },

  { field: "first_name", getOld: (o) => o.first_name, getNew: (n) => n.first_name },
  { field: "last_name", getOld: (o) => o.last_name, getNew: (n) => n.last_name },

  { field: "age", getOld: (o) => o.age, getNew: (n) => n.age },
  { field: "birth_ymd", getOld: (o) => o.birth_ymd, getNew: (n) => n.birth_ymd },

  { field: "belt_rank", getOld: (o) => o.belt_rank, getNew: (n) => n.belt_rank },
  { field: "next_belt_rank", getOld: (o) => o.next_belt_rank, getNew: (n) => n.next_belt_rank },

  { field: "attended_sessions", getOld: (o) => o.attended_sessions, getNew: (n) => n.attended_sessions },
  { field: "required_sessions", getOld: (o) => o.required_sessions, getNew: (n) => n.required_sessions },

  // OBS: progress ändras ofta automatiskt. Vill du inte logga detta, ta bort raden.
  { field: "progress", getOld: (o) => o.progress, getNew: (n) => n.progress },

  { field: "avatar_url", getOld: (o) => o.avatar_url, getNew: (n) => n.avatar_url },

  { field: "member_comment", getOld: (o) => o.member_comment, getNew: (n) => n.member_comment },
  { field: "instructor_comment", getOld: (o) => o.instructor_comment, getNew: (n) => n.instructor_comment },

  { field: "physical_enabled", getOld: (o) => o.physical_enabled, getNew: (n) => n.physical_enabled },

  { field: "grading_kihon", getOld: (o) => o.grading_kihon, getNew: (n) => n.grading_kihon },
  { field: "grading_kata", getOld: (o) => o.grading_kata, getNew: (n) => n.grading_kata },
  { field: "grading_kumite", getOld: (o) => o.grading_kumite, getNew: (n) => n.grading_kumite },
  { field: "grading_physical", getOld: (o) => o.grading_physical, getNew: (n) => n.grading_physical },

  { field: "visibility_show_age", getOld: (o) => o.visibility_show_age, getNew: (n) => n.visibility_show_age },
  {
    field: "visibility_show_belt_info",
    getOld: (o) => o.visibility_show_belt_info,
    getNew: (n) => n.visibility_show_belt_info,
  },
  {
    field: "visibility_show_grading_status",
    getOld: (o) => o.visibility_show_grading_status,
    getNew: (n) => n.visibility_show_grading_status,
  },
  {
    field: "visibility_show_member_comment",
    getOld: (o) => o.visibility_show_member_comment,
    getNew: (n) => n.visibility_show_member_comment,
  },
];

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as UpdateMemberBody | null;

    if (!body || typeof body.id !== "string") {
      return NextResponse.json({ error: "Ogiltiga data (saknar id)." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1) Hämta gammal medlem
    const { data: oldMember, error: fetchError } = await supabaseAdmin
      .from("members")
      .select(
        `
        id,
        user_id,
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
        instructor_comment,
        visibility_show_age,
        visibility_show_belt_info,
        visibility_show_grading_status,
        visibility_show_member_comment,
        grading_kihon,
        grading_kata,
        grading_kumite,
        grading_physical,
        physical_enabled,
        is_public,
        role
      `
      )
      .eq("id", body.id)
      .maybeSingle();

    if (fetchError) {
      console.error("Fel vid hämtning av gammal medlem:", fetchError);
      return NextResponse.json({ error: "Kunde inte hämta medlem." }, { status: 500 });
    }

    if (!oldMember) {
      return NextResponse.json({ error: "Medlem hittades inte." }, { status: 404 });
    }

    // 2) Uppdatera
    const updatePayload = {
      first_name: body.firstName,
      last_name: body.lastName,
      age: body.age,
      birth_ymd: body.birthYmd || null,
      belt_rank: body.beltRank,
      next_belt_rank: body.nextBeltRank,
      attended_sessions: body.attendedSessions,
      required_sessions: body.requiredSessions,
      progress: body.progress,
      avatar_url: body.avatarUrl,
      member_comment: body.memberComment,
      instructor_comment: body.instructorComment,
      visibility_show_age: body.visibility.showAge,
      visibility_show_belt_info: body.visibility.showBeltInfo,
      visibility_show_grading_status: body.visibility.showGradingStatus,
      visibility_show_member_comment: body.visibility.showMemberComment,
      grading_kihon: body.gradingStatus.kihon,
      grading_kata: body.gradingStatus.kata,
      grading_kumite: body.gradingStatus.kumite,
      grading_physical: body.gradingStatus.physical,
      physical_enabled: body.physicalEnabled,
      is_public: body.isPublic,
      role: body.role,
    };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("members")
      .update(updatePayload)
      .eq("id", body.id)
      .select(
        `
        id,
        user_id,
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
        instructor_comment,
        visibility_show_age,
        visibility_show_belt_info,
        visibility_show_grading_status,
        visibility_show_member_comment,
        grading_kihon,
        grading_kata,
        grading_kumite,
        grading_physical,
        physical_enabled,
        is_public,
        role
      `
      )
      .maybeSingle();

    if (updateError) {
      console.error("Fel vid uppdatering av medlem:", updateError);
      return NextResponse.json({ error: "Kunde inte uppdatera medlemmen." }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json({ error: "Ingen rad uppdaterades." }, { status: 500 });
    }

    // 3) Loggning: logga alla fält som ändrats (en rad per fält)
    const actor = await getAdminActorStringFromRequest(request);
    const targetName = `${updated.first_name ?? ""} ${updated.last_name ?? ""}`.trim();
    const userId = updated.user_id ?? null;
    const memberId = updated.id;

    for (const spec of MEMBER_UPDATE_LOG_FIELDS) {
      const oldVal = safeJson(spec.getOld(oldMember));
      const newVal = safeJson(spec.getNew(updated));

      if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;

      await insertAdminLog({
        actor,
        action: "update_member",
        details: {
          memberId,
          userId,
          targetName,
          field: spec.field,
          from: oldVal,
          to: newVal,
        },
      });
    }

    // 4) Returnera uppdaterad medlem i samma shape som klienten använder
    return NextResponse.json({
      member: {
        id: updated.id,
        userId: updated.user_id ?? "",
        firstName: updated.first_name ?? "",
        lastName: updated.last_name ?? "",
        age: updated.age ?? 0,
        birthYmd: updated.birth_ymd ?? "",
        beltRank: updated.belt_rank ?? "",
        nextBeltRank: updated.next_belt_rank ?? "",
        attendedSessions: updated.attended_sessions ?? 0,
        requiredSessions: updated.required_sessions ?? 0,
        progress: updated.progress ?? 0,
        avatarUrl: updated.avatar_url ?? "/main.png",
        memberComment: updated.member_comment ?? "",
        instructorComment: updated.instructor_comment ?? "",
        visibility: {
          showAge: updated.visibility_show_age ?? true,
          showBeltInfo: updated.visibility_show_belt_info ?? true,
          showGradingStatus: updated.visibility_show_grading_status ?? true,
          showMemberComment: updated.visibility_show_member_comment ?? true,
        },
        gradingStatus: {
          kihon: updated.grading_kihon ?? "not_ready",
          kata: updated.grading_kata ?? "not_ready",
          kumite: updated.grading_kumite ?? "not_ready",
          physical: updated.grading_physical ?? "not_ready",
        },
        physicalEnabled: updated.physical_enabled ?? false,
        isPublic: updated.is_public ?? true,
        role: updated.role ?? "member",
      },
    });
  } catch (err) {
    console.error("Oväntat fel i /api/admin/members/update:", err);
    return NextResponse.json({ error: "Internt serverfel." }, { status: 500 });
  }
}