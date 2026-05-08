// app/api/admin/training/sessions/list/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";

export const runtime = "nodejs";

/* =========================================================
   SUPABASE ADMIN-CLIENT
========================================================= */
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/* =========================================================
   ADMIN SESSION-VERIFY (samma stil som /admin/clubs/create)
========================================================= */
function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET saknas.");
  return new TextEncoder().encode(secret);
}

async function requireAdmin(): Promise<
  | { ok: true; role: "admin" | "superadmin" }
  | { ok: false; status: number; error: string }
> {
  const token = (await cookies()).get("admin_session")?.value;
  if (!token) return { ok: false, status: 401, error: "Ingen admin-session." };

  try {
    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret);

    const role = payload.role as string | undefined;
    if (role !== "admin" && role !== "superadmin") {
      return { ok: false, status: 403, error: "Endast Admin / SuperAdmin." };
    }

    return { ok: true, role };
  } catch {
    return { ok: false, status: 401, error: "Ogiltig admin-session." };
  }
}

/* =========================================================
   GET: LISTA TRÄNINGSPASS PER KLUBB
========================================================= */

export async function GET(request: Request) {
  try {
    // 1) Kolla att vi är admin eller superadmin
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // 2) Läs clubId från querystring
    const { searchParams } = new URL(request.url);
    const clubId = (searchParams.get("clubId") ?? "").trim();

    if (!clubId) {
      return NextResponse.json(
        { error: "clubId krävs som query-parameter (?clubId=...)." },
        { status: 400 }
      );
    }

    // Liten kontroll: ska se ut som en UUID (precis som du gör på klientsidan)
    const isUuid =
      typeof clubId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        clubId
      );

    if (!isUuid) {
      return NextResponse.json(
        { error: "Ogiltigt clubId-format." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 3) Hämta alla pass för klubben
    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from("training_sessions")
      .select(
        `
        id,
        club_id,
        weekday,
        start_time,
        end_time,
        name,
        active,
        location
      `
      )
      .eq("club_id", clubId)
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });

    if (sessionsError) {
      console.error("Fel vid hämtning av training_sessions:", sessionsError);
      return NextResponse.json(
        { error: "Kunde inte hämta träningspass." },
        { status: 500 }
      );
    }

    if (!sessions || sessions.length === 0) {
      // Inga pass ännu – returnera tom lista
      return NextResponse.json({ sessions: [] }, { status: 200 });
    }

    const sessionIds = sessions.map((s: any) => s.id);

    // 4) Hämta alla bälten för dessa pass
    const { data: belts, error: beltsError } = await supabaseAdmin
      .from("training_session_belts")
      .select("session_id, belt_rank")
      .in("session_id", sessionIds);

    if (beltsError) {
      console.error(
        "Fel vid hämtning av training_session_belts:",
        beltsError
      );
      return NextResponse.json(
        { error: "Kunde inte hämta bältesdata." },
        { status: 500 }
      );
    }

    // 5) Bygg map: session_id -> [belt_rank, ...]
    const beltsMap: Record<string, string[]> = {};
    (belts ?? []).forEach((row: any) => {
      if (!beltsMap[row.session_id]) {
        beltsMap[row.session_id] = [];
      }
      beltsMap[row.session_id].push(row.belt_rank as string);
    });

    // 6) Slå ihop
    const result = (sessions as any[]).map((s) => ({
      id: s.id as string,
      clubId: s.club_id as string,
      weekday: s.weekday as number,
      startTime: s.start_time as string,
      endTime: s.end_time as string,
      name: s.name as string,
      active: s.active as boolean,
      location: s.location as string | null,
      belts: beltsMap[s.id] ?? [],
    }));

    return NextResponse.json({ sessions: result }, { status: 200 });
  } catch (err) {
    console.error(
      "Oväntat fel i /api/admin/training/sessions/list:",
      err
    );
    return NextResponse.json(
      { error: "Internt serverfel." },
      { status: 500 }
    );
  }
}