// app/api/admin/attendance/suggest/route.ts
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

async function checkAuth(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((c) => c.trim().split("=", 2) as [string, string])
      .filter(([k]) => k)
  );

  const token = cookies["admin_session"];
  if (!token) return false;

  try {
    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret);
    const role = (payload.role as string) ?? "member";
    return role === "admin" || role === "superadmin";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const isAuthorized = await checkAuth(request);
  if (!isAuthorized) {
    return NextResponse.json({ error: "Saknar behörighet." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("memberId");
  const dateStr = searchParams.get("date"); // YYYY-MM-DD

  if (!memberId || !dateStr) {
    return NextResponse.json({ error: "Saknar memberId eller date." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // 1. Hämta medlem (club_id, belt_rank)
  const { data: m, error: mErr } = await supabase
    .from("members")
    .select("id, club_id, belt_rank")
    .eq("id", memberId)
    .maybeSingle();

  if (mErr || !m) {
    return NextResponse.json({ error: "Medlem hittades inte." }, { status: 404 });
  }

  // 2. Räkna ut veckodag från datumet (0=sön, 1=mån, ..., 6=lör)
  // Parsas som UTC för att undvika tidszonsfel
  const d = new Date(`${dateStr}T00:00:00Z`);
  const weekday = d.getUTCDay();

  // 3. Hämta aktiva pass för denna klubb och veckodag
  const { data: sessions, error: sErr } = await supabase
    .from("training_sessions")
    .select("id, weekday, start_time, end_time, name, location")
    .eq("club_id", m.club_id)
    .eq("weekday", weekday)
    .eq("active", true);

  if (sErr || !sessions || sessions.length === 0) {
    return NextResponse.json({ sessions: [] });
  }

  const sessionIds = sessions.map((s) => s.id);

  // 4. Hämta bälten för dessa pass
  const { data: beltsData, error: bErr } = await supabase
    .from("training_session_belts")
    .select("session_id, belt_rank")
    .in("session_id", sessionIds);

  const beltsMap: Record<string, string[]> = {};
  sessionIds.forEach((id) => {
    beltsMap[id] = [];
  });

  if (!bErr && beltsData) {
    beltsData.forEach((row) => {
      if (beltsMap[row.session_id]) {
        beltsMap[row.session_id].push(row.belt_rank);
      }
    });
  }

  // 5. Filtrera fram de pass som matchar medlemmens nuvarande bälte
  const matchedSessions = sessions
    .map((s) => ({
      id: s.id,
      weekday: s.weekday,
      startTime: s.start_time,
      endTime: s.end_time,
      name: s.name || "",
      location: s.location || "",
      belts: beltsMap[s.id] || [],
    }))
    .filter((s) => s.belts.includes(m.belt_rank));

  // Sortera på starttid
  matchedSessions.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return NextResponse.json({ sessions: matchedSessions });
}