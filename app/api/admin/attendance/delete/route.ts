import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";
import { insertAdminLog } from "../../logsHelper";
import { getAdminActorStringFromRequest } from "../../sessionHelper";

export const runtime = "nodejs";

function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET saknas.");
  return new TextEncoder().encode(secret);
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function requireAdminOrSuperadmin(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((c) => c.trim().split("=", 2) as [string, string])
      .filter(([k]) => k)
  );

  const token = cookies["admin_session"];
  if (!token) return { ok: false as const, status: 401 as const, error: "Inte inloggad." };

  try {
    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret);
    const role = (payload.role as string) ?? "member";
    if (role !== "admin" && role !== "superadmin") {
      return { ok: false as const, status: 403 as const, error: "Saknar behörighet." };
    }
    return { ok: true as const, memberId: (payload.sub as string) ?? null };
  } catch {
    return { ok: false as const, status: 401 as const, error: "Ogiltig session." };
  }
}

/* Samma progress-logik som i log-route */
type GradingStatusValue = "not_ready" | "partial" | "ready";
type GradingStatus = {
  kihon: GradingStatusValue;
  kata: GradingStatusValue;
  kumite: GradingStatusValue;
  physical: GradingStatusValue;
};

function calculateProgress(
  status: GradingStatus,
  attended: number,
  required: number,
  physicalEnabled: boolean
): number {
  const valueOf = (v: GradingStatusValue) =>
    v === "ready" ? 1 : v === "partial" ? 0.5 : 0;

  const parts: GradingStatusValue[] = [status.kihon, status.kata, status.kumite];
  if (physicalEnabled) parts.push(status.physical);

  const techScore = parts.reduce((sum, v) => sum + valueOf(v), 0) / parts.length;
  const attScore = required > 0 ? Math.min(attended / required, 1) : 0;

  return 0.5 * techScore + 0.5 * attScore;
}

type Body = { attendanceLogId: string };

function isUuid(v: any): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

export async function POST(request: Request) {
  const auth = await requireAdminOrSuperadmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !isUuid(body.attendanceLogId)) {
    return NextResponse.json({ error: "Ogiltiga data (attendanceLogId)." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // 1) Hämta loggen (för att veta member_id)
  const { data: logRow, error: logErr } = await supabase
    .from("attendance_logs")
    .select("id, member_id, date, type, session_id")
    .eq("id", body.attendanceLogId)
    .maybeSingle();

  if (logErr) {
    console.error("attendance/delete: kunde inte läsa logg:", logErr);
    return NextResponse.json({ error: "Kunde inte läsa logg." }, { status: 500 });
  }
  if (!logRow) {
    return NextResponse.json({ error: "Logg hittades inte." }, { status: 404 });
  }

  // 2) Ta bort loggen
  const { error: delErr } = await supabase
    .from("attendance_logs")
    .delete()
    .eq("id", body.attendanceLogId);

  if (delErr) {
    console.error("attendance/delete: delete error:", delErr);
    return NextResponse.json({ error: "Kunde inte radera loggen." }, { status: 500 });
  }

  // 3) Hämta medlem för att kunna räkna om progress
  const { data: m, error: mErr } = await supabase
    .from("members")
    .select(
      `
      id,
      attended_sessions,
      required_sessions,
      physical_enabled,
      grading_kihon,
      grading_kata,
      grading_kumite,
      grading_physical,
      first_name,
      last_name,
      user_id
    `
    )
    .eq("id", logRow.member_id)
    .maybeSingle();

  if (mErr || !m) {
    console.error("attendance/delete: kunde inte hämta medlem:", mErr);
    return NextResponse.json({
      error: "Logg raderad, men kunde inte uppdatera medlem."
    }, { status: 500 });
  }

  const newAttended = Math.max(0, (m.attended_sessions ?? 0) - 1);

  const status: GradingStatus = {
    kihon: (m.grading_kihon as GradingStatusValue) ?? "not_ready",
    kata: (m.grading_kata as GradingStatusValue) ?? "not_ready",
    kumite: (m.grading_kumite as GradingStatusValue) ?? "not_ready",
    physical: (m.grading_physical as GradingStatusValue) ?? "not_ready",
  };

  const physicalEnabled = m.physical_enabled ?? false;
  const required = m.required_sessions ?? 0;
  const newProgress = calculateProgress(status, newAttended, required, physicalEnabled);

  // 4) Uppdatera medlem
  const { data: updated, error: upErr } = await supabase
    .from("members")
    .update({
      attended_sessions: newAttended,
      progress: newProgress,
    })
    .eq("id", m.id)
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

  if (upErr || !updated) {
    console.error("attendance/delete: kunde inte uppdatera medlem:", upErr);
    return NextResponse.json({
      error: "Logg raderad, men kunde inte uppdatera medlem."
    }, { status: 500 });
  }

  // 5) Adminlogg
  try {
    const actor = await getAdminActorStringFromRequest(request);
    const targetName = `${updated.first_name ?? ""} ${updated.last_name ?? ""}`.trim();

    await insertAdminLog({
      actor,
      action: "attendance_delete",
      details: {
        attendanceLogId: logRow.id,
        memberId: updated.id,
        userId: updated.user_id ?? null,
        targetName,
        date: logRow.date,
        type: logRow.type,
        sessionId: logRow.session_id ?? null,
      },
    });
  } catch (e) {
    console.warn("attendance/delete: kunde inte skriva adminlogg:", e);
  }

  // 6) Returnera medlem (samma shape som andra endpoints)
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
}