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
    return { ok: true as const };
  } catch {
    return { ok: false as const, status: 401 as const, error: "Ogiltig session." };
  }
}

function isUuid(v: any): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

export async function GET(request: Request) {
  const auth = await requireAdminOrSuperadmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const clubId = searchParams.get("clubId");
  const date = searchParams.get("date"); // YYYY-MM-DD

  if (!isUuid(clubId) || !date) {
    return NextResponse.json({ error: "Saknar eller ogiltigt clubId/date." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // 1) Hämta logs
  const { data: logs, error: logErr } = await supabase
    .from("attendance_logs")
    .select("id, member_id, session_id, type, created_at")
    .eq("club_id", clubId)
    .eq("date", date)
    .in("type", ["regular", "extra", "instructor"])
    .order("created_at", { ascending: true });

  if (logErr) {
    console.error("byDate: logErr", logErr);
    return NextResponse.json({ error: "Kunde inte hämta loggar." }, { status: 500 });
  }

  const memberIds = Array.from(new Set((logs ?? []).map((r: any) => r.member_id).filter(Boolean)));
  const sessionIds = Array.from(new Set((logs ?? []).map((r: any) => r.session_id).filter(Boolean)));

  // 2) Hämta members
  const { data: members, error: memErr } = await supabase
    .from("members")
    .select("id, first_name, last_name, avatar_url")
    .in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);

  if (memErr) {
    console.error("byDate: memErr", memErr);
    return NextResponse.json({ error: "Kunde inte hämta medlemmar." }, { status: 500 });
  }

  const membersById = new Map<string, any>();
  (members ?? []).forEach((m: any) => membersById.set(m.id, m));

  // 3) Hämta sessions
  const { data: sessions, error: sesErr } = await supabase
    .from("training_sessions")
    .select("id, weekday, start_time, end_time, name, location")
    .in("id", sessionIds.length ? sessionIds : ["00000000-0000-0000-0000-000000000000"]);

  if (sesErr) {
    console.error("byDate: sesErr", sesErr);
    return NextResponse.json({ error: "Kunde inte hämta träningspass." }, { status: 500 });
  }

  const sessionsById = new Map<string, any>();
  (sessions ?? []).forEach((s: any) => sessionsById.set(s.id, s));

  // 4) Grupp per session_id
  const bySessionId = new Map<string, { session: any; logs: any[] }>();

  for (const row of logs ?? []) {
    const sessionId = (row as any).session_id as string | null;
    if (!sessionId) continue; // i v1: visa bara det som är kopplat till pass

    const sess = sessionsById.get(sessionId);
    if (!sess) continue;

    if (!bySessionId.has(sessionId)) {
      bySessionId.set(sessionId, {
        session: {
          id: sess.id,
          weekday: sess.weekday,
          startTime: sess.start_time,
          endTime: sess.end_time,
          name: sess.name ?? "",
          location: sess.location ?? null,
        },
        logs: [],
      });
    }

    const mem = membersById.get((row as any).member_id);
    const name = `${mem?.first_name ?? ""} ${mem?.last_name ?? ""}`.trim();

    bySessionId.get(sessionId)!.logs.push({
      id: (row as any).id,
      memberId: (row as any).member_id,
      memberName: name || "Okänd",
      memberAvatarUrl: mem?.avatar_url ?? "/main.png",
      type: (row as any).type,
      sessionId: sessionId,
      createdAt: (row as any).created_at,
    });
  }

  return NextResponse.json({ blocks: Array.from(bySessionId.values()) });
}