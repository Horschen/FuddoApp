// app/api/admin/attendance/list/route.ts
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";

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

async function requireSuperadmin(request: Request) {
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

    if (role !== "superadmin") {
      return { ok: false as const, status: 403 as const, error: "Endast SuperAdmin." };
    }

    return { ok: true as const };
  } catch {
    return { ok: false as const, status: 401 as const, error: "Ogiltig session." };
  }
}

function ymdToYyMmDd(ymd: string): string {
  // ymd: "YYYY-MM-DD" -> "YYMMDD"
  if (!ymd || ymd.length < 10) return ymd;
  const yy = ymd.slice(2, 4);
  const mm = ymd.slice(5, 7);
  const dd = ymd.slice(8, 10);
  return `${yy}${mm}${dd}`;
}

function hhmmFromIso(ts: string): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export async function GET(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("memberId");
  const limitRaw = searchParams.get("limit");

  if (!memberId) {
    return NextResponse.json({ error: "Saknar memberId." }, { status: 400 });
  }

  let limit = 5000;
  if (limitRaw && !Number.isNaN(Number(limitRaw))) {
    limit = Math.min(Math.max(Number(limitRaw), 1), 5000);
  }

  const supabase = getSupabaseAdmin();

  // Hämta loggar + vem som skapade (admin) + passinfo (om session_id finns)
  const { data, error } = await supabase
    .from("attendance_logs")
    .select(
      `
      id,
      date,
      type,
      session_id,
      created_at,
      created_by_member_id,
      created_by:members!attendance_logs_created_by_member_id_fkey (
        id,
        user_id,
        first_name,
        last_name
      ),
      session:training_sessions (
        id,
        weekday,
        start_time,
        end_time,
        name
      )
    `
    )
    .eq("member_id", memberId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("attendance/list error:", error);
    return NextResponse.json({ error: "Kunde inte hämta närvarologg." }, { status: 500 });
  }

  const logs = (data ?? []).map((row: any) => {
    const createdByName =
      row.created_by
        ? `${row.created_by.first_name ?? ""} ${row.created_by.last_name ?? ""}`.trim()
        : null;

    const createdByLabel =
      createdByName && createdByName.length > 0
        ? createdByName
        : row.created_by?.user_id
        ? `#${row.created_by.user_id}`
        : row.created_by_member_id
        ? `(${row.created_by_member_id})`
        : "Okänd";

    const dateYmd: string = row.date; // "YYYY-MM-DD"
    const createdAt: string = row.created_at;

    return {
      id: row.id,
      dateYmd,
      dateYyMmDd: ymdToYyMmDd(dateYmd),
      time: createdAt ? hhmmFromIso(createdAt) : "",
      type: row.type,
      createdBy: createdByLabel,
      session: row.session
        ? {
            id: row.session.id,
            weekday: row.session.weekday,
            startTime: row.session.start_time,
            endTime: row.session.end_time,
            name: row.session.name ?? "",
          }
        : null,
    };
  });

  return NextResponse.json({ logs, limit });
}