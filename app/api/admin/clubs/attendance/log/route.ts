// app/api/admin/attendance/log/route.ts
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";
import { insertAdminLog } from "../../logsHelper";
import { getAdminActorStringFromRequest } from "../../sessionHelper";

export const runtime = "nodejs";

/* =======================
   Helpers: auth + supabase
======================= */
function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET saknas i miljövariablerna.");
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
  if (!token) {
    return { ok: false as const, status: 401 as const, error: "Inte inloggad." };
  }

  try {
    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret);

    const role = (payload.role as string) ?? "member";
    if (role !== "admin" && role !== "superadmin") {
      return { ok: false as const, status: 403 as const, error: "Saknar behörighet." };
    }

    return {
      ok: true as const,
      memberId: (payload.sub as string) ?? null,
      role,
      name: (payload.name as string) ?? null,
    };
  } catch {
    return { ok: false as const, status: 401 as const, error: "Ogiltig session." };
  }
}

/* =======================
   Progress (samma logik som i frontend)
======================= */
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

/* =======================
   Body
======================= */
type Body = {
  memberId: string;
  date?: string; // "YYYY-MM-DD" (om saknas -> idag UTC)
  type: "regular" | "extra" | "instructor";
  sessionId?: string | null; // required for regular/instructor (recommended), null for extra
};

function isUuid(v: any): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

function todayUtcYmd() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function POST(request: Request) {
  const auth = await requireAdminOrSuperadmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !isUuid(body.memberId) || typeof body.type !== "string") {
    return NextResponse.json({ error: "Ogiltiga data." }, { status: 400 });
  }

  const date = typeof body.date === "string" && body.date ? body.date : todayUtcYmd();
  const type = body.type;
  const sessionId = body.sessionId ?? null;

  // Enkla valideringar enligt din spec
  if ((type === "regular" || type === "instructor") && sessionId && !isUuid(sessionId)) {
    return NextResponse.json({ error: "Ogiltigt sessionId." }, { status: 400 });
  }
  if (type === "extra") {
    // extra ska vara fristående i v1
    // (om du senare vill koppla extra till session kan vi ändra)
  }

  const supabase = getSupabaseAdmin();

  // 1) Hämta medlem + fält vi behöver för progress
  const { data: m, error: mErr } = await supabase
    .from("members")
    .select(
      `
      id,
      club_id,
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
    .eq("id", body.memberId)
    .maybeSingle();

  if (mErr) {
    console.error("attendance/log: kunde inte hämta medlem:", mErr);
    return NextResponse.json({ error: "Kunde inte hämta medlem." }, { status: 500 });
  }
  if (!m) {
    return NextResponse.json({ error: "Medlem hittades inte." }, { status: 404 });
  }

  // 2) Insert logg
  const insertPayload = {
    member_id: m.id,
    club_id: m.club_id,
    date,
    session_id: sessionId,
    type,
    duration_hours: 1.0,
    created_by_member_id: auth.memberId,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("attendance_logs")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();

  if (insErr) {
    // Vanligt fel här är unique constraint (dubblett)
    const msg =
      (insErr as any)?.code === "23505"
        ? "Närvaro finns redan registrerad för detta (dubblett)."
        : "Kunde inte registrera närvaro.";
    console.error("attendance/log: insert error:", insErr);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 3) Uppdatera attended_sessions (+1)
  const newAttended = (m.attended_sessions ?? 0) + 1;

  const status: GradingStatus = {
    kihon: (m.grading_kihon as GradingStatusValue) ?? "not_ready",
    kata: (m.grading_kata as GradingStatusValue) ?? "not_ready",
    kumite: (m.grading_kumite as GradingStatusValue) ?? "not_ready",
    physical: (m.grading_physical as GradingStatusValue) ?? "not_ready",
  };

  const physicalEnabled = m.physical_enabled ?? false;
  const required = m.required_sessions ?? 0;

  const newProgress = calculateProgress(status, newAttended, required, physicalEnabled);

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
    console.error("attendance/log: kunde inte uppdatera member:", upErr);
    return NextResponse.json({ error: "Närvaro loggades, men kunde inte uppdatera medlem." }, { status: 500 });
  }

  // 4) Adminlogg (valfritt men bra)
  try {
    const actor = await getAdminActorStringFromRequest(request);
    const targetName = `${updated.first_name ?? ""} ${updated.last_name ?? ""}`.trim();

    await insertAdminLog({
      actor,
      action: "attendance_log",
      details: {
        memberId: updated.id,
        userId: updated.user_id ?? null,
        targetName,
        date,
        type,
        sessionId: sessionId ?? null,
        attendanceLogId: inserted?.id ?? null,
      },
    });
  } catch (e) {
    console.warn("attendance/log: kunde inte skriva adminlogg:", e);
  }

  // 5) Returnera i samma shape som klienten använder
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